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
--
-- ATOMICITY & RPC-SURFACE HARDENING PASS (Phase 2)
--   P2-1 — submit_quiz_result() makes quiz submission atomic + idempotent
--          (locks the session FOR UPDATE, re-checks completed_at) so a
--          double-submit can no longer double-apply card reviews
--   P2-2 — create_deck_with_cards_and_charge() commits the deck insert, card
--          inserts, card_count sync and credit deduction in one transaction
--          (replaces the cross-HTTP deduct-last + compensating-delete pattern)
--   P2-3 — SECURITY FIX: EXECUTE on the service-role-only SECURITY DEFINER
--          functions (deduct_credit, grant_credits, check_rate_limit,
--          check_referral_cap, approve_payment, reject_payment, ensure_profile)
--          revoked from PUBLIC/anon/authenticated — they were callable directly
--          via the PostgREST RPC surface (free credits / self-upgrade to Pro /
--          drain another user's credits). See Section 4.15.
--
-- GAP-FIX PASS (2026-06-10)
--   E3 — downgrade_expired_pro(): daily pg_cron job flips lapsed Pro
--        subscriptions (subscription_expires_at <= now()) back to 'free'.
--        Previously nothing enforced expiry — once Pro, always Pro.
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
  credits_granted_at      TIMESTAMPTZ,                          -- last Pro monthly top-up; NULL = never granted
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
  category         TEXT        NOT NULL DEFAULT '',
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
  -- B4: deck_share attributions reference the shared deck, so a deck can only
  -- ever earn its reward once (see ux_referral_deck_share_once_per_deck, §2).
  -- NULL for all other event types.
  deck_id         UUID        REFERENCES public.decks(id) ON DELETE SET NULL,
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
-- E4/E5: payment_id is nullable — 'credit_grant' (manual admin credit grants)
--     and 'account_deleted' (E5 self-service deletion audit) actions aren't
--     tied to a payment. target_user_id + credits_amount support those rows.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_action_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable: if the admin account is deleted the log row is preserved
  admin_id       UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- RESTRICT: cannot delete a payment submission that has been acted on.
  -- NULL for non-payment actions (credit_grant, account_deleted).
  payment_id     UUID        REFERENCES public.payment_submissions(id) ON DELETE RESTRICT,
  -- Set for credit_grant (the recipient) and account_deleted (the deleted user).
  target_user_id UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Set for credit_grant — the number of credits granted.
  credits_amount INTEGER,
  action         TEXT        NOT NULL CHECK (action IN ('approved', 'rejected', 'credit_grant', 'account_deleted')),
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 1.10 app_reviews
-- B4: user-submitted in-app reviews ("Write a review" reward, +15 credits,
-- ReferralCaps.app_review.requiresAdminVerification). Credits are NOT granted
-- on insert — an admin verifies via verify_app_review() (§4.16), which inserts
-- the corresponding referral_events row (verified=true) and grants credits.
-- one_review_per_user enforces the lifetime cap of 1 from ReferralCaps.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_reviews (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating      INTEGER     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT        NOT NULL CHECK (char_length(review_text) <= 1000),
  status      TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  admin_notes TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT one_review_per_user UNIQUE (user_id)
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

-- AUDIT 2.1: at most ONE 'signup' attribution may ever exist per referred user.
-- Hard DB backstop against the double-award race — even if app logic slips, a
-- second signup credit for the same referred_id raises unique_violation.
-- Partial (event_type = 'signup') so deck_share/app_review/profile_complete are
-- unaffected; NULL referred_id rows (referred user deleted) are exempt.
CREATE UNIQUE INDEX IF NOT EXISTS ux_referral_signup_once_per_referred
  ON public.referral_events (referred_id)
  WHERE event_type = 'signup' AND referred_id IS NOT NULL;

-- B4: a deck can only ever earn the deck_share credit once, regardless of how
-- many times it's toggled public/private.
CREATE UNIQUE INDEX IF NOT EXISTS ux_referral_deck_share_once_per_deck
  ON public.referral_events (deck_id)
  WHERE event_type = 'deck_share' AND deck_id IS NOT NULL;

-- rate_limit_log: hot-path — every rate-checked request hits this
CREATE INDEX IF NOT EXISTS idx_rate_limit_log
  ON public.rate_limit_log (user_id, endpoint, requested_at DESC);

-- admin_action_log: payment audit trail
CREATE INDEX IF NOT EXISTS idx_admin_action_log_payment
  ON public.admin_action_log (payment_id, created_at DESC);

-- admin_action_log: per-user audit trail (credit_grant / account_deleted)
CREATE INDEX IF NOT EXISTS idx_admin_action_log_target_user
  ON public.admin_action_log (target_user_id, created_at DESC);

-- admin_action_log: E4 audit-log feed, newest first
CREATE INDEX IF NOT EXISTS idx_admin_action_log_created_at
  ON public.admin_action_log (created_at DESC);

-- app_reviews: admin pending-review queue
CREATE INDEX IF NOT EXISTS idx_app_reviews_status
  ON public.app_reviews (status, created_at ASC)
  WHERE status = 'pending';


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
    full_name,
    course,
    referral_code,
    token_balance,
    consent_deepseek
  )
  VALUES (
    NEW.id,
    NEW.email,
    -- Pulled from auth.users.raw_user_meta_data, set in /api/auth/signup.
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'course', ''),
    public.generate_unique_referral_code(),
    3,      -- TierLimits.free.startingCredits
    COALESCE((NEW.raw_user_meta_data->>'consent_deepseek')::boolean, false)
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
-- 4.3 ensure_profile(p_user_id)
-- Self-heal: recreates a missing profiles row for an existing auth user.
-- handle_new_user() provisions profiles on signup, but a profile can go missing
-- (e.g. manual deletion during ops/testing) — leaving an orphaned auth user with
-- no profile. The login route calls this when its profile fetch returns null.
-- Mirrors handle_new_user()'s column values exactly; ON CONFLICT (id) DO NOTHING
-- makes it idempotent and safe to call on every login.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_profile(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, email, full_name, course, referral_code, token_balance, consent_deepseek
  )
  SELECT
    u.id,
    u.email,
    NULLIF(u.raw_user_meta_data->>'full_name', ''),
    NULLIF(u.raw_user_meta_data->>'course', ''),
    public.generate_unique_referral_code(),
    3,      -- TierLimits.free.startingCredits
    COALESCE((u.raw_user_meta_data->>'consent_deepseek')::boolean, false)
  FROM auth.users u
  WHERE u.id = p_user_id
  ON CONFLICT (id) DO NOTHING;
END;
$$;

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
-- 4.7a admin_grant_credits(p_admin_id, p_target_user_id, p_amount, p_notes)
-- E4: Atomic manual credit grant + audit log row, mirroring how
-- approve_payment() pairs grant_credits() with an admin_action_log insert in
-- one transaction. action='credit_grant', payment_id NULL.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_grant_credits(
  p_admin_id       UUID,
  p_target_user_id UUID,
  p_amount         INTEGER,
  p_notes          TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_balance INTEGER;
BEGIN
  new_balance := public.grant_credits(p_target_user_id, p_amount);

  INSERT INTO public.admin_action_log (admin_id, target_user_id, credits_amount, action, notes)
  VALUES (p_admin_id, p_target_user_id, p_amount, 'credit_grant', p_notes);

  RETURN new_balance;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4.7b pro_monthly_credit_refresh()
-- Called by the daily pg_cron job to top up Pro users who haven't received
-- their monthly 30-credit allotment in the last 28 days and whose subscription
-- is still active. 28 days avoids month-boundary drift (Jan 1 → Jan 29, not
-- Feb 1). Idempotent: credits_granted_at prevents double-grants per period.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pro_monthly_credit_refresh()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.profiles
    WHERE subscription_tier = 'pro'
      AND subscription_expires_at > now()
      AND (credits_granted_at IS NULL
           OR credits_granted_at < now() - INTERVAL '28 days')
  LOOP
    PERFORM public.grant_credits(r.id, 30);
    UPDATE public.profiles
    SET    credits_granted_at = now()
    WHERE  id = r.id;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4.7c downgrade_expired_pro()
-- E3: Called by the daily pg_cron job to flip lapsed Pro subscriptions back to
-- 'free' once subscription_expires_at has passed. Without this, feature gates
-- that check subscription_tier (not the expiry date) would treat a user as Pro
-- forever after their last payment. SECURITY DEFINER + postgres-owned so it can
-- write subscription_tier / subscription_expires_at past the
-- block_privilege_escalation / protect_immutable_profile_fields triggers, which
-- only allow service_role/postgres/supabase_admin through.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.downgrade_expired_pro()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET    subscription_tier       = 'free',
         subscription_expires_at = NULL
  WHERE  subscription_tier = 'pro'
    AND  subscription_expires_at IS NOT NULL
    AND  subscription_expires_at <= now();
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
  -- in the same transaction. credits_granted_at is stamped here so the daily
  -- pg_cron top-up skips users who were just approved.
  PERFORM public.grant_credits(v_user_id, 30);
  UPDATE public.profiles SET credits_granted_at = now() WHERE id = v_user_id;

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
-- 4.11b prepare_account_deletion(p_user_id)
-- E5: Run before auth.admin.deleteUser(p_user_id). Detaches the user's
-- payment_submissions from admin_action_log (the RESTRICT FK would otherwise
-- block the cascade delete from auth.users -> profiles -> payment_submissions),
-- and writes an 'account_deleted' audit row (admin_id NULL — self-service).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prepare_account_deletion(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.admin_action_log
  SET    payment_id = NULL
  WHERE  payment_id IN (
    SELECT id FROM public.payment_submissions WHERE user_id = p_user_id
  );

  INSERT INTO public.admin_action_log (admin_id, target_user_id, action, notes)
  VALUES (NULL, p_user_id, 'account_deleted', 'Self-service account deletion');
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

-- ---------------------------------------------------------------------------
-- 4.13 submit_quiz_result(p_session_id, p_answers)
-- Phase 2: atomic + idempotent quiz submission. Replaces the app-layer sequence
-- (check completed_at → insert answers → N apply_card_review calls → complete
-- session) which, under a double-submit race, could pass the completed_at check
-- twice and double-apply card reviews — corrupting times_seen / difficulty_score
-- (which drive Living Deck selection).
--
-- SECURITY INVOKER (default): every statement runs under the caller's RLS, so
-- the session, its answers, and the card stat updates are all confined to the
-- caller's own rows. Call through the SESSION client, never service-role.
--
-- p_answers is a JSONB array of:
--   [{ "flashcardId": <uuid>, "userAnswer": <text|null>, "isCorrect": <bool> }, ...]
--
-- Idempotency: the session row is locked FOR UPDATE and re-checked inside the
-- transaction. A concurrent second submit blocks on the lock, then sees
-- completed_at set and raises ALREADY_SUBMITTED — so reviews apply exactly once.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_quiz_result(
  p_session_id UUID,
  p_answers    JSONB
)
RETURNS TABLE (correct_count INTEGER, total_questions INTEGER, score_percent INTEGER)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_completed_at TIMESTAMPTZ;
  v_correct      INTEGER;
  v_total        INTEGER;
  v_score        INTEGER;
BEGIN
  -- Lock the session. RLS confines this SELECT to the caller's own session, so
  -- a missing OR not-owned id both yield NOT FOUND (no ownership leak).
  SELECT qs.completed_at INTO v_completed_at
  FROM   public.quiz_sessions qs
  WHERE  qs.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND'
      USING HINT = 'No quiz session with that id is owned by the caller';
  END IF;

  IF v_completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_SUBMITTED'
      USING HINT = 'This quiz session has already been submitted';
  END IF;

  -- SECURITY (audit 3.1): correctness is re-derived HERE from the canonical
  -- flashcard.back, NOT trusted from the client's isCorrect flag. A client can
  -- send any isCorrect it likes; the authoritative score must come from the DB.
  -- Matching mirrors the client's grading: case-insensitive, whitespace-trimmed
  -- equality (works for both identification typing and multiple-choice, where
  -- the selected option text equals the card back when correct). RLS confines
  -- the join to the caller's own cards, so a foreign/unknown flashcardId
  -- resolves to no row → graded incorrect and earns no score. The grading join
  -- is inlined per statement (rather than a temp table) so the function is safe
  -- to call more than once within a single transaction.

  -- Tally from the server-derived grade.
  SELECT COUNT(*)::int,
         COUNT(*) FILTER (WHERE g.is_correct)::int
  INTO   v_total, v_correct
  FROM (
    SELECT COALESCE(
             a->>'userAnswer' IS NOT NULL
             AND f.back IS NOT NULL
             AND lower(btrim(a->>'userAnswer')) = lower(btrim(f.back)),
             false
           ) AS is_correct
    FROM   jsonb_array_elements(p_answers) AS a
    LEFT   JOIN public.flashcards f ON f.id = (a->>'flashcardId')::uuid
  ) g;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'NO_ANSWERS'
      USING HINT = 'At least one answer is required';
  END IF;

  v_score := round(v_correct * 100.0 / v_total);

  -- Persist every answer in a single insert (server-derived is_correct).
  INSERT INTO public.quiz_answers (session_id, flashcard_id, user_answer, is_correct)
  SELECT p_session_id,
         (a->>'flashcardId')::uuid,
         a->>'userAnswer',
         COALESCE(
           a->>'userAnswer' IS NOT NULL
           AND f.back IS NOT NULL
           AND lower(btrim(a->>'userAnswer')) = lower(btrim(f.back)),
           false
         )
  FROM   jsonb_array_elements(p_answers) AS a
  LEFT   JOIN public.flashcards f ON f.id = (a->>'flashcardId')::uuid;

  -- Update each reviewed card's stats in one set-based statement. RLS confines
  -- the UPDATE to the caller's own cards, so a foreign flashcardId is a no-op.
  -- Difficulty nudge mirrors the previous app-layer formula exactly:
  --   correct → GREATEST(0, score - 0.15);  wrong → LEAST(1, score + 0.25)
  -- Answers are de-duplicated per card (a session shows each card once; the
  -- GROUP BY also avoids UPDATE…FROM's undefined result on duplicate matches).
  UPDATE public.flashcards f
  SET    times_seen       = f.times_seen + 1,
         times_correct    = f.times_correct + (CASE WHEN a.is_correct THEN 1 ELSE 0 END),
         difficulty_score = CASE WHEN a.is_correct
                                 THEN GREATEST(0, f.difficulty_score - 0.15)
                                 ELSE LEAST(1, f.difficulty_score + 0.25)
                            END,
         last_reviewed_at = now()
  FROM (
    SELECT (a->>'flashcardId')::uuid AS flashcard_id,
           bool_or(
             COALESCE(
               a->>'userAnswer' IS NOT NULL
               AND fc.back IS NOT NULL
               AND lower(btrim(a->>'userAnswer')) = lower(btrim(fc.back)),
               false
             )
           ) AS is_correct
    FROM   jsonb_array_elements(p_answers) AS a
    LEFT   JOIN public.flashcards fc ON fc.id = (a->>'flashcardId')::uuid
    GROUP  BY (a->>'flashcardId')::uuid
  ) a
  WHERE  f.id = a.flashcard_id;

  -- Finalise the session (Living Deck refresh is not wired yet → false).
  UPDATE public.quiz_sessions
  SET    correct_count                 = v_correct,
         score_percent                 = v_score,
         living_deck_refresh_triggered = false,
         completed_at                  = now()
  WHERE  id = p_session_id;

  RETURN QUERY SELECT v_correct, v_total, v_score;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4.14 create_deck_with_cards_and_charge(...)
-- Phase 2: atomic generate persistence — deck insert + flashcard inserts +
-- card_count sync + credit deduction in ONE transaction. Replaces the app-layer
-- "insert deck → insert cards → deduct_credit() (separate HTTP calls) +
-- compensating delete" pattern, which could leave an orphan deck or an uncharged
-- generation if a step failed between calls.
--
-- SECURITY DEFINER (not INVOKER): it must call deduct_credit(), whose EXECUTE is
-- revoked from anon/authenticated (§4.15). Running as the owner lets that nested
-- call through. Because the inserts then bypass RLS, ownership is enforced
-- explicitly: p_user_id must equal auth.uid(), and every row is written with
-- that id — so a caller can only ever create its own deck/cards and spend its
-- own credit. Called via the SESSION client (auth.uid() must be present); a
-- service-role call has no auth.uid() and is rejected by the guard.
--
-- p_cards is a JSONB array of { front, back, tags (text[]), category }.
-- If deduct_credit() raises INSUFFICIENT_CREDITS the whole transaction — deck
-- and cards included — rolls back, so a failed charge never leaves a deck.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_deck_with_cards_and_charge(
  p_user_id         UUID,
  p_title           TEXT,
  p_source_filename TEXT,
  p_generation_mode TEXT,
  p_pdf_type        TEXT,
  p_cards           JSONB
)
RETURNS TABLE (deck_id UUID, credits_remaining INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deck_id    UUID;
  v_card_count INTEGER;
  v_remaining  INTEGER;
BEGIN
  -- Ownership guard: a DEFINER function bypasses RLS, so refuse to act for
  -- anybody but the authenticated caller (and never for a service-role call,
  -- where auth.uid() is NULL).
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: cannot create a deck for another user';
  END IF;

  INSERT INTO public.decks (user_id, title, source_filename, generation_mode, pdf_type)
  VALUES (
    p_user_id,
    p_title,
    NULLIF(p_source_filename, ''),
    COALESCE(NULLIF(p_generation_mode, ''), 'standard'),
    COALESCE(NULLIF(p_pdf_type, ''), 'text')
  )
  RETURNING id INTO v_deck_id;

  INSERT INTO public.flashcards (deck_id, user_id, front, back, tags, category, is_reinforcement)
  SELECT v_deck_id,
         p_user_id,
         c->>'front',
         c->>'back',
         COALESCE(
           (SELECT array_agg(t) FROM jsonb_array_elements_text(c->'tags') AS t),
           '{}'::text[]
         ),
         COALESCE(c->>'category', ''),
         false
  FROM   jsonb_array_elements(p_cards) AS c;

  GET DIAGNOSTICS v_card_count = ROW_COUNT;

  UPDATE public.decks SET card_count = v_card_count WHERE id = v_deck_id;

  -- Deduct last: on INSUFFICIENT_CREDITS the whole tx (deck + cards) rolls back.
  v_remaining := public.deduct_credit(p_user_id);

  RETURN QUERY SELECT v_deck_id, v_remaining;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4.14c insert_reinforcement_cards_and_charge(p_user_id, p_deck_id, p_cards)
-- Living Deck (TODO §8): atomic persistence of AI-generated reinforcement
-- cards + card_count sync + 1-credit charge, in ONE transaction. Mirrors
-- create_deck_with_cards_and_charge() (§4.14): if deduct_credit() raises
-- INSUFFICIENT_CREDITS, the inserted cards and card_count bump roll back too —
-- so a Living Deck refresh never leaves orphan reinforcement cards uncharged,
-- and credits are never spent without cards landing.
--
-- SECURITY DEFINER (must call deduct_credit(), whose EXECUTE is revoked from
-- authenticated — §4.15). Self-guarded: p_user_id must equal auth.uid(), and
-- the deck must be owned by that same user. Called via the SESSION client.
--
-- p_cards is a JSONB array of { front, back, tags (text[]), category }, same
-- shape as create_deck_with_cards_and_charge's p_cards. All inserted rows get
-- is_reinforcement = true.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.insert_reinforcement_cards_and_charge(
  p_user_id UUID,
  p_deck_id UUID,
  p_cards   JSONB
)
RETURNS TABLE (inserted_count INTEGER, credits_remaining INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner     UUID;
  v_inserted  INTEGER;
  v_remaining INTEGER;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: cannot refresh a deck for another user';
  END IF;

  SELECT user_id INTO v_owner
  FROM   public.decks
  WHERE  id = p_deck_id
  FOR UPDATE;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'DECK_NOT_FOUND'
      USING HINT = 'No deck with that id exists';
  END IF;

  IF v_owner IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'FORBIDDEN: cannot refresh a deck owned by another user';
  END IF;

  IF jsonb_array_length(p_cards) = 0 THEN
    RAISE EXCEPTION 'NO_CARDS'
      USING HINT = 'p_cards must contain at least one card';
  END IF;

  INSERT INTO public.flashcards (deck_id, user_id, front, back, tags, category, is_reinforcement)
  SELECT p_deck_id,
         p_user_id,
         c->>'front',
         c->>'back',
         COALESCE(
           (SELECT array_agg(t) FROM jsonb_array_elements_text(c->'tags') AS t),
           '{}'::text[]
         ),
         COALESCE(c->>'category', ''),
         true
  FROM   jsonb_array_elements(p_cards) AS c;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  UPDATE public.decks
  SET    card_count = card_count + v_inserted
  WHERE  id = p_deck_id;

  -- Charge last: on INSUFFICIENT_CREDITS the whole tx (cards + card_count) rolls back.
  v_remaining := public.deduct_credit(p_user_id);

  RETURN QUERY SELECT v_inserted, v_remaining;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4.14b claim_referral(p_referred_id, p_referrer_id, p_event_type, p_month_key, p_credits)
-- SECURITY FIX (audit 2.1/A2): atomic, single-source referral attribution.
-- Previously TWO non-transactional code paths (auth/callback auto-processing and
-- the /api/referral/claim form) each did check→grant→log→set-referred_by as
-- separate statements, so they could double-award credits to a referrer for one
-- referred user (TOCTOU on referred_by, plus no unique constraint). This function
-- folds the whole attribution into one transaction:
--   1. lock the referred profile row (FOR UPDATE) so concurrent claims serialise
--   2. re-check referred_by IS NULL          → ALREADY_REFERRED
--   3. reject self-referral                  → SELF_REFERRAL
--   4. re-check the monthly/lifetime cap      → REFERRAL_CAP_REACHED
--   5. insert the referral_events ledger row (backed by the partial unique index
--      ux_referral_signup_once_per_referred, §2, as a hard duplicate backstop)
--   6. grant_credits() to the REFERRER (atomic)
--   7. stamp referred_by on the referred profile
-- SECURITY DEFINER so the nested grant_credits()/insert run as the owner (their
-- EXECUTE/INSERT are locked down for authenticated). Called ONLY via the
-- service-role client from both referral paths.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_referral(
  p_referred_id UUID,
  p_referrer_id UUID,
  p_event_type  TEXT,
  p_month_key   TEXT,
  p_credits     INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referred_by UUID;
BEGIN
  IF p_referrer_id = p_referred_id THEN
    RAISE EXCEPTION 'SELF_REFERRAL'
      USING HINT = 'A user cannot refer themselves';
  END IF;

  SELECT referred_by INTO v_referred_by
  FROM   public.profiles
  WHERE  id = p_referred_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: no profile with id %', p_referred_id;
  END IF;

  IF v_referred_by IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_REFERRED'
      USING HINT = 'This user has already been attributed to a referrer';
  END IF;

  IF NOT public.check_referral_cap(p_referrer_id, p_event_type, p_month_key) THEN
    RAISE EXCEPTION 'REFERRAL_CAP_REACHED'
      USING HINT = 'Referrer has hit the monthly/lifetime cap for this event type';
  END IF;

  INSERT INTO public.referral_events
    (referrer_id, referred_id, event_type, credits_awarded, verified, month_key)
  VALUES
    (p_referrer_id, p_referred_id, p_event_type, p_credits, true, p_month_key);

  PERFORM public.grant_credits(p_referrer_id, p_credits);

  UPDATE public.profiles
  SET    referred_by = p_referrer_id
  WHERE  id = p_referred_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4.14d claim_self_referral_event(p_user_id, p_event_type, p_credits, p_month_key, p_deck_id)
-- B4: atomic self-earned reward (profile_complete, deck_share — "Ways to earn"
-- on /rewards that are not referrer/referred attributions). Differs from
-- claim_referral() (§4.14b): referrer_id = referred_id = p_user_id (the user
-- grants the reward to themselves), no referred_by/SELF_REFERRAL checks, and
-- both event types are auto-verified (verified = true). Reuses
-- check_referral_cap() (§4.8) unchanged — it already covers profile_complete
-- (lifetime cap 1) and deck_share (monthly cap 3); the
-- ux_referral_deck_share_once_per_deck index (§2) additionally caps deck_share
-- at once per deck.
--
-- SECURITY DEFINER (must call grant_credits(), EXECUTE revoked from
-- authenticated). Self-guarded: p_user_id must equal auth.uid(). service_role
-- only — called from a route handler via the admin client (like
-- claim_referral), since it must call grant_credits().
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_self_referral_event(
  p_user_id    UUID,
  p_event_type TEXT,
  p_credits    INTEGER,
  p_month_key  TEXT,
  p_deck_id    UUID DEFAULT NULL
)
RETURNS INTEGER  -- new token_balance
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  IF p_event_type NOT IN ('profile_complete', 'deck_share') THEN
    RAISE EXCEPTION 'INVALID_EVENT_TYPE: % is not a self-claimable event', p_event_type;
  END IF;

  IF p_event_type = 'deck_share' AND p_deck_id IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: p_deck_id is required for deck_share';
  END IF;

  -- Lock the profile row so concurrent claims (e.g. double-click) serialise.
  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: no profile with id %', p_user_id;
  END IF;

  IF NOT public.check_referral_cap(p_user_id, p_event_type, p_month_key) THEN
    RAISE EXCEPTION 'REFERRAL_CAP_REACHED'
      USING HINT = 'You have reached the limit for this reward';
  END IF;

  INSERT INTO public.referral_events
    (referrer_id, referred_id, event_type, credits_awarded, verified, month_key, deck_id)
  VALUES
    (p_user_id, p_user_id, p_event_type, p_credits, true, p_month_key, p_deck_id);

  v_new_balance := public.grant_credits(p_user_id, p_credits);

  RETURN v_new_balance;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4.16 verify_app_review(p_admin_id, p_review_id, p_approve, p_credits, p_notes)
-- B4: atomic admin verification of an app_reviews row, mirroring
-- approve_payment()/reject_payment() (§4.10-4.11): claims the row
-- (status='pending' guard — concurrent admin gets ALREADY_PROCESSED), then on
-- approve inserts the referral_events ledger row (verified=true,
-- event_type='app_review', referrer_id=referred_id=user_id) and calls
-- grant_credits() — both atomic with the status flip. On reject, just flips
-- status (no credit). p_credits is passed in from contracts.ts
-- ReferralCaps.app_review.creditsAwarded rather than hardcoded.
--
-- service_role only (callers must gate behind requireAdmin first).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_app_review(
  p_admin_id  UUID,
  p_review_id UUID,
  p_approve   BOOLEAN,
  p_credits   INTEGER,
  p_notes     TEXT DEFAULT NULL
)
RETURNS UUID  -- the reviewed user's id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  UPDATE public.app_reviews
  SET    status      = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         reviewed_by = p_admin_id,
         reviewed_at = now(),
         admin_notes = p_notes
  WHERE  id     = p_review_id
    AND  status = 'pending'
  RETURNING user_id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ALREADY_PROCESSED'
      USING HINT = 'Review is not pending (already approved/rejected or missing)';
  END IF;

  IF p_approve THEN
    IF p_credits <= 0 THEN
      RAISE EXCEPTION 'INVALID_AMOUNT: p_credits must be greater than 0';
    END IF;

    INSERT INTO public.referral_events
      (referrer_id, referred_id, event_type, credits_awarded, verified, month_key)
    VALUES
      (v_user_id, v_user_id, 'app_review', p_credits, true, to_char(now(), 'YYYY-MM'));

    PERFORM public.grant_credits(v_user_id, p_credits);
  END IF;

  RETURN v_user_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4.15 EXECUTE-privilege lockdown for service-role-only functions
-- SECURITY FIX (P2-3): CREATE FUNCTION grants EXECUTE to PUBLIC by default, and
-- Supabase additionally grants it to anon + authenticated — which exposed these
-- SECURITY DEFINER money/tier/audit functions on the PostgREST RPC surface. A
-- logged-in (or anonymous) client could call e.g.
--   rpc('grant_credits',   { p_user_id: <self>,   p_amount: 999999 })  → free credits
--   rpc('approve_payment', { ... })                                    → self-upgrade to Pro
--   rpc('deduct_credit',   { p_user_id: <victim> })                    → drain others' credits
-- bypassing the credit/payment economy and the profile-guard triggers (which let
-- the DEFINER owner through). These are only ever invoked server-side via the
-- service-role client (or nested from other DEFINER fns), so EXECUTE is revoked
-- from PUBLIC/anon/authenticated and kept for service_role.
--
-- NOT revoked (intentionally reachable by the authenticated role):
--   is_current_user_admin()              RLS policies evaluate it as authenticated
--   apply_card_review()                  SECURITY INVOKER, via the session client
--   submit_quiz_result()                 SECURITY INVOKER, via the session client
--   create_deck_with_cards_and_charge()  DEFINER but self-guarded; the session
--                                        client calls it, and it calls
--                                        deduct_credit() as its owner (which is
--                                        precisely why deduct_credit can be locked)
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.deduct_credit(uuid)                            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_credits(uuid, integer)                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_referral_cap(uuid, text, text)           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_payment(uuid, uuid, text)              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_payment(uuid, uuid, text, text)         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_profile(uuid)                           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pro_monthly_credit_refresh()                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.downgrade_expired_pro()                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_referral(uuid, uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_self_referral_event(uuid, text, integer, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_app_review(uuid, uuid, boolean, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_grant_credits(uuid, uuid, integer, text)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prepare_account_deletion(uuid)                  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.deduct_credit(uuid)                             TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_credits(uuid, integer)                    TO service_role;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, integer, integer)  TO service_role;
GRANT EXECUTE ON FUNCTION public.check_referral_cap(uuid, text, text)            TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_payment(uuid, uuid, text)               TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_payment(uuid, uuid, text, text)          TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_profile(uuid)                            TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_referral(uuid, uuid, text, text, integer)  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_self_referral_event(uuid, text, integer, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_app_review(uuid, uuid, boolean, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_grant_credits(uuid, uuid, integer, text)  TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_account_deletion(uuid)                  TO service_role;
-- pro_monthly_credit_refresh / downgrade_expired_pro are called by pg_cron
-- (postgres role) — no service_role grant needed;

-- The two Phase 2 RPCs (§4.13/§4.14) are invoked by the SESSION client, i.e. the
-- authenticated role — so authenticated KEEPS EXECUTE. anon has no legitimate
-- use: create_deck_with_cards_and_charge() self-guards on auth.uid() (NULL for
-- anon → FORBIDDEN) and submit_quiz_result() is RLS-confined — but revoke anon
-- anyway to shrink the RPC surface (also clears the anon SECURITY DEFINER linter
-- finding on create_deck_with_cards_and_charge). The remaining "authenticated can
-- execute a SECURITY DEFINER function" advisory for create_deck_with_cards_and_charge
-- is INTENTIONAL: DEFINER is required so it can call the (locked-down)
-- deduct_credit() as owner, and the auth.uid() guard makes it safe.
REVOKE EXECUTE ON FUNCTION public.submit_quiz_result(uuid, jsonb)                                          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_deck_with_cards_and_charge(uuid, text, text, text, text, jsonb)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.insert_reinforcement_cards_and_charge(uuid, uuid, jsonb)                 FROM PUBLIC, anon;


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
ALTER TABLE public.app_reviews         ENABLE ROW LEVEL SECURITY;

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

-- B5: anyone (including anon) can read decks marked public. Additive — the
-- FOR ALL owner policy above already covers owner SELECT/INSERT/UPDATE/DELETE;
-- this only ever grants extra SELECT access on is_public = true rows, so
-- writes remain owner-only.
DROP POLICY IF EXISTS "decks: anyone read public" ON public.decks;

CREATE POLICY "decks: anyone read public"
  ON public.decks FOR SELECT
  USING (is_public = true);

-- ---------------------------------------------------------------------------
-- flashcards — full CRUD on own rows (user_id denormalised for performance)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "flashcards: users crud own" ON public.flashcards;

CREATE POLICY "flashcards: users crud own"
  ON public.flashcards FOR ALL
  USING    (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- B5: anyone can read flashcards belonging to a public deck.
DROP POLICY IF EXISTS "flashcards: anyone read of public deck" ON public.flashcards;

CREATE POLICY "flashcards: anyone read of public deck"
  ON public.flashcards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = flashcards.deck_id AND d.is_public = true
    )
  );

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

-- ---------------------------------------------------------------------------
-- app_reviews
-- Users: insert and read their own. Admins: read all + update (verify workflow).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "app_reviews: users insert own" ON public.app_reviews;
DROP POLICY IF EXISTS "app_reviews: users read own"   ON public.app_reviews;
DROP POLICY IF EXISTS "app_reviews: admins read all"  ON public.app_reviews;
DROP POLICY IF EXISTS "app_reviews: admins update"    ON public.app_reviews;

CREATE POLICY "app_reviews: users insert own"
  ON public.app_reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "app_reviews: users read own"
  ON public.app_reviews FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "app_reviews: admins read all"
  ON public.app_reviews FOR SELECT
  USING (public.is_current_user_admin());

CREATE POLICY "app_reviews: admins update"
  ON public.app_reviews FOR UPDATE
  USING    (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());


-- =============================================================================
-- 6. pg_cron JOBS
-- Requires pg_cron extension enabled in Supabase Dashboard → Extensions.
-- =============================================================================

-- M1: Unschedule first so re-running this file does not create duplicate jobs.
SELECT cron.unschedule(jobid)
FROM   cron.job
WHERE  jobname IN (
  'crammable-cleanup-rate-limit-log',
  'crammable-pro-monthly-refresh',
  'crammable-pro-expiry-downgrade'
);

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

-- Grant 30 credits to active Pro users who haven't been topped up in 28 days.
-- 28 days guards against month-boundary drift while staying within the 30-day
-- subscription window. Runs daily at midnight UTC.
SELECT cron.schedule(
  'crammable-pro-monthly-refresh',
  '0 0 * * *',
  'SELECT public.pro_monthly_credit_refresh();'
);

-- E3: Flip lapsed Pro subscriptions (subscription_expires_at in the past) back
-- to 'free'. Runs daily at midnight UTC, just before the monthly-refresh job —
-- order matters: refresh's `subscription_expires_at > now()` filter already
-- excludes expired rows, but running the downgrade first keeps the two jobs'
-- intent (top up active Pros / demote lapsed Pros) cleanly separated.
SELECT cron.schedule(
  'crammable-pro-expiry-downgrade',
  '0 0 * * *',
  'SELECT public.downgrade_expired_pro();'
);


-- =============================================================================
-- E1: REALTIME — payment status notifications
-- Adds payment_submissions to the supabase_realtime publication so the client
-- can subscribe to postgres_changes (UPDATE) scoped by RLS to the caller's own
-- rows ("payment_submissions: users read own", §5). Idempotent.
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'payment_submissions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_submissions;
  END IF;
END $$;


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
--   Realtime is enabled on payment_submissions (see "E1: REALTIME" above) — the
--   client subscribes to postgres_changes for live approve/reject notifications.
--
-- E4 ADMIN CREDIT GRANT PATTERN (service-role client only)
--   admin.rpc('admin_grant_credits', { p_admin_id, p_target_user_id, p_amount, p_notes })
--   Atomic grant_credits() + admin_action_log insert (action='credit_grant').
--
-- E5 ACCOUNT DELETION PATTERN (service-role client only)
--   1. admin.rpc('prepare_account_deletion', { p_user_id })
--   2. admin.auth.admin.deleteUser(p_user_id)
--   Step 1 detaches admin_action_log.payment_id (RESTRICT) and writes the
--   'account_deleted' audit row; step 2 cascades through every FK (profiles,
--   decks, flashcards, quiz_*, payment_submissions, referral_events, app_reviews).
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
