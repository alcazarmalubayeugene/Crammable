-- =============================================================================
-- schema.sql
-- Crammable — Supabase / PostgreSQL
--
-- HOW TO APPLY
--   Paste into Supabase → SQL Editor → Run
--   Or: supabase db push (if using local CLI)
--
-- This is a DROP-IN REPLACEMENT. Run against a fresh Supabase project.
-- No ALTER TABLE migration DDL is generated.
--
-- ORDER MATTERS — run top to bottom.
--   0. Extensions
--   1. Tables
--   2. Indexes
--   3. Helper functions (used by RLS policies)
--   4. Auth & business-logic functions + triggers
--   5. Row-Level Security
--   6. pg_cron jobs
--
-- FIXES APPLIED IN THIS VERSION (security review)
--   C1 — admin_action_log FKs: admin_id SET NULL, payment_id RESTRICT
--   C2 — referral_events INSERT policy removed (fraud vector)
--   C3 — check_rate_limit() serialised with pg_advisory_xact_lock
--   C4 — deduct_credit() uses RETURNING (eliminates stale-read window)
--   C5 — handle_new_user() handles referral_code unique_violation with ON CONFLICT
--   H1 — payment_submissions.reference_number UNIQUE constraint added
--   H2 — partial unique index: one pending payment per user
--   H3 — protect_immutable_profile_fields() trigger added
--   H4 — no_self_referral CHECK constraint added to profiles
--   H5 — correct_count <= total_questions CHECK constraint added
--   M1 — pg_cron schedule is now idempotent (unschedule before schedule)
--   M2 — is_current_user_admin() STABLE function; all admin RLS policies updated
--   M3 — idx_referral_events_referred_id added
--   M4 — idx_flashcards_user_id added
--   L2 — referral_events.credits_awarded CHECK against known cap values
--
-- PROD-READINESS REVIEW (integration layer pass)
--   PR-C1 — protect_immutable_profile_fields() now also guards token_balance
--           and subscription_expires_at (was user-writable via the profiles
--           UPDATE RLS policy → credit/Pro economy bypass)
--   PR-H1 — approve_payment()/reject_payment() SECURITY DEFINER fns make the
--           admin verify/reject flow atomic (claim → tier → audit) with
--           renewal-stacking expiry
--   PR-H2 — apply_card_review() does the review-counter increment in one
--           atomic statement (was a lost-update race in the app layer)
--   PR-M2 — approve_payment() now also grants the Pro monthly allotment (30)
--           via grant_credits() in the same transaction
-- =============================================================================


-- =============================================================================
-- 0. EXTENSIONS
-- =============================================================================

-- pg_cron: needed for scheduled rate_limit_log cleanup (free in Supabase).
-- Enable in Supabase Dashboard → Database → Extensions → pg_cron first.
-- CREATE EXTENSION IF NOT EXISTS pg_cron;


-- =============================================================================
-- 1. TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1.1 profiles
-- Extends auth.users 1:1. Created automatically by trigger (see Section 4).
-- Never INSERT into this table directly — let the trigger handle it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id                      UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                   TEXT         NOT NULL UNIQUE,
  full_name               TEXT,
  course                  TEXT,
  subscription_tier       TEXT         NOT NULL DEFAULT 'free'
                                       CHECK (subscription_tier IN ('free', 'pro')),
  subscription_expires_at TIMESTAMPTZ,
  token_balance           INTEGER      NOT NULL DEFAULT 3
                                       CHECK (token_balance >= 0),
  lifetime_credits_earned INTEGER      NOT NULL DEFAULT 0
                                       CHECK (lifetime_credits_earned >= 0),
  is_admin                BOOLEAN      NOT NULL DEFAULT false,
  referral_code           TEXT         NOT NULL UNIQUE,
  referred_by             UUID         REFERENCES public.profiles(id) ON DELETE SET NULL,
  consent_deepseek        BOOLEAN      NOT NULL DEFAULT false,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),

  -- H4: prevent self-referral at DB level
  CONSTRAINT no_self_referral CHECK (referred_by IS NULL OR referred_by != id)
);

-- ---------------------------------------------------------------------------
-- 1.2 decks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.decks (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title           TEXT        NOT NULL,
  source_filename TEXT,
  card_count      INTEGER     NOT NULL DEFAULT 0
                              CHECK (card_count >= 0),
  generation_mode TEXT        NOT NULL DEFAULT 'standard'
                              CHECK (generation_mode IN ('standard', 'deep_dive')),
  pdf_type        TEXT        NOT NULL DEFAULT 'text'
                              CHECK (pdf_type IN ('text', 'ocr', 'paste')),
  is_public       BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 1.3 flashcards
-- user_id is denormalised here for RLS performance (avoids joining decks).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.flashcards (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id          UUID        NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  front            TEXT        NOT NULL,
  back             TEXT        NOT NULL,
  tags             TEXT[]      NOT NULL DEFAULT '{}',
  is_reinforcement BOOLEAN     NOT NULL DEFAULT false,
  difficulty_score FLOAT       NOT NULL DEFAULT 0.5
                               CHECK (difficulty_score >= 0 AND difficulty_score <= 1),
  times_seen       INTEGER     NOT NULL DEFAULT 0,
  times_correct    INTEGER     NOT NULL DEFAULT 0,
  last_reviewed_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 1.4 quiz_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quiz_sessions (
  id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id                       UUID        NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  user_id                       UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quiz_type                     TEXT        NOT NULL
                                            CHECK (quiz_type IN ('multiple_choice', 'identification', 'mixed')),
  total_questions               INTEGER     NOT NULL CHECK (total_questions > 0),
  correct_count                 INTEGER     NOT NULL DEFAULT 0
                                            CHECK (correct_count >= 0),
  score_percent                 FLOAT                CHECK (score_percent >= 0 AND score_percent <= 100),
  living_deck_refresh_triggered BOOLEAN     NOT NULL DEFAULT false,
  completed_at                  TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- H5: correct answers cannot exceed total questions
  CONSTRAINT correct_count_lte_total CHECK (correct_count <= total_questions)
);

-- ---------------------------------------------------------------------------
-- 1.5 quiz_answers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quiz_answers (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID        NOT NULL REFERENCES public.quiz_sessions(id) ON DELETE CASCADE,
  flashcard_id UUID        NOT NULL REFERENCES public.flashcards(id) ON DELETE CASCADE,
  user_answer  TEXT,
  is_correct   BOOLEAN     NOT NULL,
  answered_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 1.6 payment_submissions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_submissions (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID           NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- H1: each GCash reference number may only appear once across all submissions
  reference_number TEXT           NOT NULL UNIQUE CHECK (reference_number ~ '^\d{13}$'),
  amount           NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  payment_method   TEXT           NOT NULL DEFAULT 'gcash'
                                  CHECK (payment_method IN ('gcash', 'cash')),
  status           TEXT           NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'verified', 'rejected')),
  rejection_reason TEXT,
  verified_by      UUID           REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 1.7 referral_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referral_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_id     UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type      TEXT        NOT NULL
                              CHECK (event_type IN ('signup', 'deck_share', 'app_review', 'profile_complete')),
  -- L2: credits_awarded must match a known cap value from contracts.ts ReferralCaps
  -- Update this list if caps change in contracts.ts
  credits_awarded INTEGER     NOT NULL CHECK (credits_awarded IN (3, 5, 10, 15)),
  verified        BOOLEAN     NOT NULL DEFAULT false,
  month_key       TEXT        NOT NULL CHECK (month_key ~ '^\d{4}-\d{2}$'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 1.8 rate_limit_log
-- Stores ALLOWED requests only. Cleaned hourly by pg_cron.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint     TEXT        NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 1.9 admin_action_log
-- C1: admin_id is nullable (SET NULL) so deleting an admin profile does NOT
--     destroy their audit trail. payment_id uses RESTRICT so a payment with
--     an audit entry cannot be deleted.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_action_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable: if the admin account is deleted the log row is preserved
  admin_id   UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- RESTRICT: cannot delete a payment submission that has been acted on
  payment_id UUID        NOT NULL REFERENCES public.payment_submissions(id) ON DELETE RESTRICT,
  action     TEXT        NOT NULL CHECK (action IN ('approved', 'rejected')),
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- =============================================================================
-- 2. INDEXES
-- =============================================================================

-- profiles: referral code lookup on signup
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code
  ON public.profiles (referral_code);

-- profiles: admin dashboard email lookups during payment approval
CREATE INDEX IF NOT EXISTS idx_profiles_email
  ON public.profiles (email);

-- decks: dashboard list query
CREATE INDEX IF NOT EXISTS idx_decks_user_id
  ON public.decks (user_id, created_at DESC);

-- flashcards: deck viewer
CREATE INDEX IF NOT EXISTS idx_flashcards_deck_id
  ON public.flashcards (deck_id);

-- flashcards: Living Deck weak-card selection (non-reinforcement cards only)
CREATE INDEX IF NOT EXISTS idx_flashcards_difficulty
  ON public.flashcards (deck_id, difficulty_score DESC)
  WHERE is_reinforcement = false;

-- M4: flashcards: direct user_id queries (RLS evaluation + Living Deck user scope)
CREATE INDEX IF NOT EXISTS idx_flashcards_user_id
  ON public.flashcards (user_id);

-- quiz_sessions: user history
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_user_id
  ON public.quiz_sessions (user_id, created_at DESC);

-- quiz_answers: result screen fetch
CREATE INDEX IF NOT EXISTS idx_quiz_answers_session_id
  ON public.quiz_answers (session_id);

-- payment_submissions: admin dashboard (pending rows only)
CREATE INDEX IF NOT EXISTS idx_payment_submissions_status
  ON public.payment_submissions (status, created_at ASC)
  WHERE status = 'pending';

-- payment_submissions: user's own payment history (all statuses)
CREATE INDEX IF NOT EXISTS idx_payment_submissions_user_id
  ON public.payment_submissions (user_id, created_at DESC);

-- H2: enforce at most one pending submission per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pending_payment_per_user
  ON public.payment_submissions (user_id)
  WHERE status = 'pending';

-- referral_events: monthly cap enforcement (referrer side)
CREATE INDEX IF NOT EXISTS idx_referral_events_cap_check
  ON public.referral_events (referrer_id, event_type, month_key);

-- M3: referral_events: referred-user lookup (RLS SELECT policy uses referred_id)
CREATE INDEX IF NOT EXISTS idx_referral_events_referred_id
  ON public.referral_events (referred_id);

-- rate_limit_log: hot-path — every rate-checked request hits this
CREATE INDEX IF NOT EXISTS idx_rate_limit_log
  ON public.rate_limit_log (user_id, endpoint, requested_at DESC);

-- admin_action_log: payment audit trail
CREATE INDEX IF NOT EXISTS idx_admin_action_log_payment
  ON public.admin_action_log (payment_id, created_at DESC);


-- =============================================================================
-- 3. HELPER FUNCTIONS (referenced by RLS policies — must exist before Section 5)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 3.1 is_current_user_admin()
-- M2: STABLE function so PostgreSQL evaluates it once per query, not once per
-- row. Eliminates the N×profile-lookup overhead on admin dashboard queries.
-- SECURITY DEFINER so it can read profiles even when RLS would otherwise block.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()),
    false
  )
$$;


-- =============================================================================
-- 4. AUTH & BUSINESS-LOGIC FUNCTIONS + TRIGGERS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 4.1 generate_unique_referral_code()
-- Generates a unique 8-character uppercase hex code.
-- Called inside handle_new_user(); handle_new_user() handles the rare case
-- where a collision occurs between the uniqueness check and the INSERT.
--
-- Uses gen_random_uuid() (Postgres core, in pg_catalog) rather than
-- gen_random_bytes() (pgcrypto, in the `extensions` schema). handle_new_user
-- runs with SET search_path = public, which excludes the extensions schema —
-- so any pgcrypto call here would fail with "function does not exist" when
-- invoked through the trigger. gen_random_uuid() is always on the path.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_unique_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  code          TEXT;
  already_taken INTEGER;
BEGIN
  LOOP
    code := upper(substring(replace(gen_random_uuid()::text, '-', '') FROM 1 FOR 8));
    SELECT COUNT(*) INTO already_taken FROM public.profiles WHERE referral_code = code;
    EXIT WHEN already_taken = 0;
  END LOOP;
  RETURN code;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4.2 handle_new_user()
-- Fires AFTER INSERT ON auth.users — creates the matching profiles row.
-- C5: ON CONFLICT (referral_code) regenerates the code on the extremely rare
--     simultaneous-signup collision, preventing the trigger from erroring out
--     and silently failing the user's account creation.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    referral_code,
    token_balance,
    consent_deepseek
  )
  VALUES (
    NEW.id,
    NEW.email,
    public.generate_unique_referral_code(),
    3,      -- TierLimits.free.startingCredits
    false   -- user must consent at signup
  )
  ON CONFLICT (referral_code) DO UPDATE
    SET referral_code = public.generate_unique_referral_code();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 4.3 set_updated_at()
-- Generic trigger: keeps updated_at current on every UPDATE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS decks_set_updated_at ON public.decks;
CREATE TRIGGER decks_set_updated_at
  BEFORE UPDATE ON public.decks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4.4 prevent_privilege_escalation()
-- Blocks authenticated / anon clients from flipping is_admin or
-- subscription_tier. service_role, postgres, and supabase_admin are allowed
-- through — the admin payment approval flow requires this.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'FORBIDDEN: is_admin cannot be changed through this route';
  END IF;
  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier THEN
    RAISE EXCEPTION 'FORBIDDEN: subscription_tier cannot be changed through this route';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_privilege_escalation ON public.profiles;
CREATE TRIGGER block_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_privilege_escalation();

-- ---------------------------------------------------------------------------
-- 4.5 protect_immutable_profile_fields()
-- H3: Prevents authenticated clients from mutating columns that must be
-- write-once after creation:
--   referral_code           — changing it breaks everyone's existing referral links
--   lifetime_credits_earned — fraud-detection counter; must only go up
--   referred_by             — referral attribution is set once on signup
-- service_role / postgres are allowed through for admin tooling.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_immutable_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN
    RAISE EXCEPTION 'FORBIDDEN: referral_code is immutable after creation';
  END IF;
  IF NEW.lifetime_credits_earned IS DISTINCT FROM OLD.lifetime_credits_earned THEN
    RAISE EXCEPTION 'FORBIDDEN: lifetime_credits_earned is managed by the server only';
  END IF;
  IF NEW.referred_by IS DISTINCT FROM OLD.referred_by THEN
    RAISE EXCEPTION 'FORBIDDEN: referred_by is set once on signup and cannot be changed';
  END IF;

  -- C1: the credit economy lives in these two columns. The profiles UPDATE RLS
  -- policy lets a user write their own row, so without these guards any client
  -- with the anon key could PATCH their own token_balance / extend their Pro
  -- expiry, bypassing credits and payments entirely. service_role (deduct_credit,
  -- grant_credits, approve_payment) is allowed through by the early return above.
  IF NEW.token_balance IS DISTINCT FROM OLD.token_balance THEN
    RAISE EXCEPTION 'FORBIDDEN: token_balance is managed by the server only';
  END IF;
  IF NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at THEN
    RAISE EXCEPTION 'FORBIDDEN: subscription_expires_at is managed by the server only';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_immutable_profile_fields ON public.profiles;
CREATE TRIGGER protect_immutable_profile_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_immutable_profile_fields();

-- ---------------------------------------------------------------------------
-- 4.6 deduct_credit(p_user_id)
-- Atomically decrements token_balance by 1.
-- C4: Uses RETURNING in the UPDATE — eliminates the separate SELECT and its
--     stale-read race window. The returned value is the post-decrement balance.
-- Raises INSUFFICIENT_CREDITS if balance is already 0.
-- MUST be called in the same transaction as deck + flashcard inserts so that
-- a DeepSeek failure rolls back the credit deduction.
--
-- Usage:
--   const { data: remaining } = await serviceClient.rpc('deduct_credit', { p_user_id })
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deduct_credit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining_balance INTEGER;
BEGIN
  UPDATE public.profiles
  SET    token_balance = token_balance - 1,
         updated_at    = now()
  WHERE  id            = p_user_id
    AND  token_balance > 0
  RETURNING token_balance INTO remaining_balance;

  IF remaining_balance IS NULL THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS'
      USING HINT = 'User has 0 credits remaining';
  END IF;

  RETURN remaining_balance;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4.7 grant_credits(p_user_id, p_amount)
-- Atomically increments token_balance and lifetime_credits_earned.
-- Returns the new token_balance.
-- Used by: referral callbacks, admin credit grants, monthly Pro top-ups.
--
-- Usage:
--   const { data: newBalance } = await serviceClient.rpc('grant_credits', {
--     p_user_id: referrerId,
--     p_amount:  ReferralCaps.signup.creditsAwarded,
--   })
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_credits(
  p_user_id UUID,
  p_amount  INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_balance INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: p_amount must be greater than 0';
  END IF;

  UPDATE public.profiles
  SET    token_balance           = token_balance + p_amount,
         lifetime_credits_earned = lifetime_credits_earned + p_amount,
         updated_at              = now()
  WHERE  id = p_user_id
  RETURNING token_balance INTO new_balance;

  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: no profile with id %', p_user_id;
  END IF;

  RETURN new_balance;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4.8 check_referral_cap(p_referrer_id, p_event_type, p_month_key)
-- Returns TRUE if allowed to earn credits, FALSE if a cap has been hit.
-- Mirrors ReferralCaps in contracts.ts — keep both in sync when caps change.
--
-- Caps:
--   signup:           monthly 5
--   deck_share:       monthly 3
--   app_review:       lifetime 1
--   profile_complete: lifetime 1
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_referral_cap(
  p_referrer_id UUID,
  p_event_type  TEXT,
  p_month_key   TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  monthly_count  INTEGER;
  lifetime_count INTEGER;
BEGIN
  IF p_event_type IN ('signup', 'deck_share') THEN
    SELECT COUNT(*) INTO monthly_count
    FROM   public.referral_events
    WHERE  referrer_id = p_referrer_id
      AND  event_type  = p_event_type
      AND  month_key   = p_month_key;

    IF p_event_type = 'signup'     AND monthly_count >= 5 THEN RETURN false; END IF;
    IF p_event_type = 'deck_share' AND monthly_count >= 3 THEN RETURN false; END IF;
  END IF;

  IF p_event_type IN ('app_review', 'profile_complete') THEN
    SELECT COUNT(*) INTO lifetime_count
    FROM   public.referral_events
    WHERE  referrer_id = p_referrer_id
      AND  event_type  = p_event_type;

    IF lifetime_count >= 1 THEN RETURN false; END IF;
  END IF;

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4.9 check_rate_limit(p_user_id, p_endpoint, p_window_minutes, p_max_requests)
-- Returns (allowed BOOLEAN, remaining INTEGER).
-- C3: Serialised with pg_advisory_xact_lock keyed on hash(user_id || endpoint).
--     Two concurrent requests for the same user+endpoint are processed one at
--     a time — eliminates the TOCTOU race that allowed limit overrun.
-- Blocked requests are NOT logged.
--
-- Usage:
--   const { data } = await serviceClient.rpc('check_rate_limit', {
--     p_user_id:        userId,
--     p_endpoint:       ApiPaths.generate,
--     p_window_minutes: RateLimits[ApiPaths.generate].windowMinutes,
--     p_max_requests:   RateLimits[ApiPaths.generate].maxRequests,
--   })
--   if (!data[0].allowed) return Response.json({...}, { status: 429 })
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id        UUID,
  p_endpoint       TEXT,
  p_window_minutes INTEGER,
  p_max_requests   INTEGER
)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  window_start  TIMESTAMPTZ;
  request_count INTEGER;
  lock_key      BIGINT;
BEGIN
  -- Acquire a transaction-scoped advisory lock serialised on user+endpoint.
  -- Two concurrent calls with the same pair will queue — the second will see
  -- the first's INSERT and evaluate the count correctly.
  lock_key := hashtext(p_user_id::TEXT || p_endpoint);
  PERFORM pg_advisory_xact_lock(lock_key);

  window_start := now() - (p_window_minutes * INTERVAL '1 minute');

  SELECT COUNT(*) INTO request_count
  FROM   public.rate_limit_log
  WHERE  user_id      = p_user_id
    AND  endpoint     = p_endpoint
    AND  requested_at > window_start;

  IF request_count >= p_max_requests THEN
    RETURN QUERY SELECT false, 0;
  ELSE
    INSERT INTO public.rate_limit_log (user_id, endpoint)
    VALUES (p_user_id, p_endpoint);

    RETURN QUERY SELECT true, (p_max_requests - request_count - 1);
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- 4.10 approve_payment(p_admin_id, p_payment_id, p_notes)
-- H1: Atomic admin approval. supabase-js cannot wrap multiple table writes in
-- one transaction, so the claim → tier upgrade → audit insert must live in a
-- single function or a partial failure can leave a payment 'verified' while the
-- user is never upgraded. Returns the upgraded user_id.
--
-- Concurrency: the status='pending' guard on the UPDATE means a second admin
-- acting on the same row gets zero rows back → ALREADY_PROCESSED.
-- Renewal: expiry extends from the later of the current expiry and now, so
-- renewing mid-cycle does not discard remaining Pro time.
-- service_role only (callers must gate behind requireAdmin first).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_payment(
  p_admin_id   UUID,
  p_payment_id UUID,
  p_notes      TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  UPDATE public.payment_submissions
  SET    status      = 'verified',
         verified_by = p_admin_id,
         verified_at = now()
  WHERE  id     = p_payment_id
    AND  status = 'pending'
  RETURNING user_id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ALREADY_PROCESSED'
      USING HINT = 'Payment is not pending (already verified/rejected or missing)';
  END IF;

  UPDATE public.profiles
  SET    subscription_tier       = 'pro',
         subscription_expires_at  = GREATEST(COALESCE(subscription_expires_at, now()), now())
                                    + INTERVAL '30 days',
         updated_at               = now()
  WHERE  id = v_user_id;

  -- M2: grant the Pro monthly allotment (contracts TierLimits.pro.monthlyCredits = 30)
  -- in the same transaction. No monthly top-up cron exists yet, so approval is
  -- currently the only place a Pro user receives their credits.
  PERFORM public.grant_credits(v_user_id, 30);

  INSERT INTO public.admin_action_log (admin_id, payment_id, action, notes)
  VALUES (p_admin_id, p_payment_id, 'approved', p_notes);

  RETURN v_user_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4.11 reject_payment(p_admin_id, p_payment_id, p_reason, p_notes)
-- H1: Atomic admin rejection (claim → audit insert). Returns the user_id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_payment(
  p_admin_id   UUID,
  p_payment_id UUID,
  p_reason     TEXT,
  p_notes      TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  UPDATE public.payment_submissions
  SET    status           = 'rejected',
         rejection_reason  = p_reason,
         verified_by       = p_admin_id,
         verified_at       = now()
  WHERE  id     = p_payment_id
    AND  status = 'pending'
  RETURNING user_id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ALREADY_PROCESSED'
      USING HINT = 'Payment is not pending (already verified/rejected or missing)';
  END IF;

  INSERT INTO public.admin_action_log (admin_id, payment_id, action, notes)
  VALUES (p_admin_id, p_payment_id, 'rejected', p_notes);

  RETURN v_user_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4.12 apply_card_review(p_card_id, p_was_correct, p_difficulty)
-- H2: Atomic relative increment of a card's review counters. Replaces a
-- read-modify-write in the app layer that lost updates under concurrent
-- reviews and could corrupt difficulty_score (which drives Living Deck
-- selection).
--
-- SECURITY INVOKER (default): RLS on flashcards ("users crud own") applies, so
-- a caller can only ever update their OWN card even though it's addressed by id.
-- Call through the SESSION client, not the service role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_card_review(
  p_card_id      UUID,
  p_was_correct  BOOLEAN,
  p_difficulty   FLOAT
)
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE public.flashcards
  SET    times_seen       = times_seen + 1,
         times_correct    = times_correct + (CASE WHEN p_was_correct THEN 1 ELSE 0 END),
         difficulty_score = p_difficulty,
         last_reviewed_at = now()
  WHERE  id = p_card_id;
$$;


-- =============================================================================
-- 5. ROW-LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decks               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcards          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_answers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_action_log    ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- profiles
-- Users read and update their own row.
-- Privileged columns (is_admin, subscription_tier, referral_code,
-- lifetime_credits_earned, referred_by) are guarded by triggers 4.4 and 4.5.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles: users read own"   ON public.profiles;
DROP POLICY IF EXISTS "profiles: users update own" ON public.profiles;

CREATE POLICY "profiles: users read own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles: users update own"
  ON public.profiles FOR UPDATE
  USING    (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- decks — full CRUD on own rows
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "decks: users crud own" ON public.decks;

CREATE POLICY "decks: users crud own"
  ON public.decks FOR ALL
  USING    (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- flashcards — full CRUD on own rows (user_id denormalised for performance)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "flashcards: users crud own" ON public.flashcards;

CREATE POLICY "flashcards: users crud own"
  ON public.flashcards FOR ALL
  USING    (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- quiz_sessions — full CRUD on own rows
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "quiz_sessions: users crud own" ON public.quiz_sessions;

CREATE POLICY "quiz_sessions: users crud own"
  ON public.quiz_sessions FOR ALL
  USING    (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- quiz_answers — access resolved via parent session ownership
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "quiz_answers: users crud own" ON public.quiz_answers;

CREATE POLICY "quiz_answers: users crud own"
  ON public.quiz_answers FOR ALL
  USING (
    auth.uid() = (SELECT user_id FROM public.quiz_sessions WHERE id = session_id)
  )
  WITH CHECK (
    auth.uid() = (SELECT user_id FROM public.quiz_sessions WHERE id = session_id)
  );

-- ---------------------------------------------------------------------------
-- payment_submissions
-- Users: insert and read their own.
-- Admins: read all + update (approve / reject workflow).
-- M2: is_current_user_admin() called once per query, not once per row.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "payment_submissions: users insert own"   ON public.payment_submissions;
DROP POLICY IF EXISTS "payment_submissions: users read own"     ON public.payment_submissions;
DROP POLICY IF EXISTS "payment_submissions: admins read all"    ON public.payment_submissions;
DROP POLICY IF EXISTS "payment_submissions: admins update"      ON public.payment_submissions;

CREATE POLICY "payment_submissions: users insert own"
  ON public.payment_submissions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "payment_submissions: users read own"
  ON public.payment_submissions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "payment_submissions: admins read all"
  ON public.payment_submissions FOR SELECT
  USING (public.is_current_user_admin());

CREATE POLICY "payment_submissions: admins update"
  ON public.payment_submissions FOR UPDATE
  USING    (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- ---------------------------------------------------------------------------
-- referral_events
-- Users: read events where they are referrer or referred party.
-- C2: INSERT policy removed entirely — all inserts go through SECURITY DEFINER
--     functions (grant_credits + manual log insert via service-role client).
--     An open INSERT policy was a fraud vector (arbitrary referrer_id +
--     credits_awarded values).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "referral_events: users read own"      ON public.referral_events;
DROP POLICY IF EXISTS "referral_events: service role insert" ON public.referral_events;

CREATE POLICY "referral_events: users read own"
  ON public.referral_events FOR SELECT
  USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- ---------------------------------------------------------------------------
-- rate_limit_log
-- No client policies. All access goes through check_rate_limit() SECURITY
-- DEFINER function. RLS enabled with no policies = deny all for every role
-- except those that bypass RLS (service_role).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- admin_action_log
-- Admins: read all + insert new audit entries.
-- M2: is_current_user_admin() called once per query.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_action_log: admins read all" ON public.admin_action_log;
DROP POLICY IF EXISTS "admin_action_log: admins insert"   ON public.admin_action_log;

CREATE POLICY "admin_action_log: admins read all"
  ON public.admin_action_log FOR SELECT
  USING (public.is_current_user_admin());

CREATE POLICY "admin_action_log: admins insert"
  ON public.admin_action_log FOR INSERT
  WITH CHECK (public.is_current_user_admin());


-- =============================================================================
-- 6. pg_cron JOBS
-- Requires pg_cron extension enabled in Supabase Dashboard → Extensions.
-- =============================================================================

-- M1: Unschedule first so re-running this file does not create duplicate jobs.
SELECT cron.unschedule(jobid)
FROM   cron.job
WHERE  jobname = 'crammable-cleanup-rate-limit-log';

-- Delete rate_limit_log rows older than 24 hours (= 1440 min, the maximum
-- window in RateLimits from contracts.ts). Runs every hour on the hour.
SELECT cron.schedule(
  'crammable-cleanup-rate-limit-log',
  '0 * * * *',
  $$
    DELETE FROM public.rate_limit_log
    WHERE requested_at < now() - INTERVAL '24 hours';
  $$
);


-- =============================================================================
-- BACKEND DEV NOTES
-- =============================================================================
--
-- WHICH CLIENT TO USE
--   Service-role (bypasses RLS) — required for:
--     deduct_credit(), grant_credits(), check_rate_limit()
--     admin approve/reject writes (payment_submissions + admin_action_log)
--   Session client (RLS applies) — everything else
--
-- CREDIT DEDUCTION PATTERN
--   Call deduct_credit() in the SAME transaction as deck + flashcard inserts.
--   DeepSeek failure → rollback → credit never deducted.
--   Returns new INTEGER balance for GenerateResult.creditsRemaining.
--
--   const { data: remaining } = await serviceClient.rpc('deduct_credit', { p_user_id })
--
-- REFERRAL CREDIT PATTERN
--   Call grant_credits() — atomic, no race condition.
--
--   const { data: newBalance } = await serviceClient.rpc('grant_credits', {
--     p_user_id: referrerId,
--     p_amount:  ReferralCaps.signup.creditsAwarded,
--   })
--
-- ADMIN APPROVAL PATTERN (service-role client only)
--   1. UPDATE payment_submissions SET status='verified', verified_by=adminId, verified_at=now()
--   2. UPDATE profiles SET subscription_tier='pro', subscription_expires_at=<30d from now>
--   3. INSERT INTO admin_action_log (admin_id, payment_id, action, notes)
--   Enable Realtime on payment_submissions in Supabase Dashboard for live student notifications.
--
-- ADDING A NEW ADMIN
--   Via service-role client or Supabase SQL Editor only:
--   UPDATE public.profiles SET is_admin = true WHERE email = 'admin@example.com';
--
-- CONTRACTS.TS SYNC POINTS
--   If ReferralCaps credit values change → update referral_events CHECK constraint (Section 1.7)
--   If RateLimits windows change        → verify pg_cron cleanup interval (Section 6)
--   If SubscriptionTier values change   → update profiles CHECK constraint (Section 1.1)
-- =============================================================================
