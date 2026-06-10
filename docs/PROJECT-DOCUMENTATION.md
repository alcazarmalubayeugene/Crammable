# Crammable — Project Documentation

Consolidated reference for the **Crammable** backend/app: current state, the data-access
layer, database setup history & gotchas, the auth operations runbook, a session changelog,
and the roadmap. (Deferred work is tracked separately in `docs/TODO.md`.)

> **Stack:** Next.js 16.2.6 (App Router, Turbopack default) · TypeScript · Supabase
> (Postgres + Auth + Storage + RLS) · DeepSeek (generation) · Vitest (tests).
> **Single source of truth:** `src/lib/contracts.ts` (types/routes/limits — the root
> `contracts.ts` just re-exports it) and `schema.sql` (database). Never hardcode a value that
> already lives in `contracts.ts`.
>
> **Live Supabase project:** Crammable — `gjrdlmxlqngqcnflygcp`.

## Contents
1. Overview
2. Current state — what's built & working
3. Data-access / integration layer
4. Database setup history & gotchas
5. Local testing guide
6. Auth operations runbook (rescuing stuck users)
7. Change log / session history
8. Reference notes
9. Not yet built / roadmap

---

## 1. Overview

- **App:** Crammable — upload a PDF → AI generates flashcards → quiz yourself. For Philippine
  students. Payments are manual GCash with admin verification.
- **Architecture:** Next.js App Router on Vercel; Supabase for Postgres/Auth/Storage/RLS;
  DeepSeek for generation.
- **Contract → schema → code:** when the schema changes, update `contracts.ts` first, then
  migrate the DB, then adapt the code — never the reverse.

---

## 2. Current state — what's built & working

### Authentication system

| Area | Files | Status |
|---|---|---|
| Supabase clients | `src/lib/supabase/server.ts`, `admin.ts`, `middleware-client.ts` | ✅ |
| Auth helpers | `src/lib/auth/helpers.ts` (`requireAuth`, `requireAdmin`, `getCurrentUser`, `getCurrentProfile`) | ✅ |
| Error handling | `src/lib/auth/errors.ts` (`AuthError` + response builders) | ✅ |
| Route protection | `src/proxy.ts` (Next 16 renamed `middleware` → `proxy`) | ✅ |
| Signup | `src/app/api/auth/signup/route.ts` | ✅ |
| Login | `src/app/api/auth/login/route.ts` | ✅ (self-heals missing profile) |
| Logout | `src/app/api/auth/logout/route.ts` | ✅ |
| Forgot / reset password | `src/app/api/auth/forgot-password/route.ts`, `reset-password/route.ts` | ✅ (forgot-password **page** not built — see TODO) |
| Resend confirmation | `src/app/api/auth/resend-confirmation/route.ts` | ✅ (new) |
| OAuth/email callback | `src/app/api/auth/callback/route.ts` | ✅ |

### Database (deployed to Supabase & verified)

- **9 tables:** `profiles`, `decks`, `flashcards`, `quiz_sessions`, `quiz_answers`,
  `payment_submissions`, `referral_events`, `rate_limit_log`, `admin_action_log`.
- **RLS** enabled on every table with per-user and admin policies.
- **Triggers:** auto-create profile on signup (`handle_new_user`), `updated_at` maintenance,
  privilege-escalation guard, immutable-field guard.
- **Functions:** `deduct_credit`, `grant_credits`, `check_referral_cap`, `check_rate_limit`,
  `is_current_user_admin`, `generate_unique_referral_code`, `handle_new_user`,
  `ensure_profile` (self-heal), plus the atomic `approve_payment` / `reject_payment` /
  `apply_card_review` from the integration layer.
- **pg_cron** job to clean old rate-limit logs.

### Feature API routes

| Route | File | Status |
|---|---|---|
| `POST /api/upload` | `src/app/api/upload/route.ts` | ✅ PDF → in-memory text extraction → OCR detection. The PDF is parsed from the request buffer and **never written to Storage** (stronger than the old "delete after extraction" — nothing to delete). Auth/consent/rate-limit always enforced + CSRF + size pre-check (2026-06-10) |
| `POST /api/generate` | `src/app/api/generate/route.ts` | ✅ DeepSeek generation; tier + deck-limit enforcement; `createDeckWithCards` + `deductCredit` |
| `GET /api/decks` | `src/app/api/decks/route.ts` | ✅ User's decks, session-client RLS |
| `GET /api/decks/[id]` | `src/app/api/decks/[id]/route.ts` | ✅ Deck + cards; 404 for non-owned (no ownership leak) |
| `DELETE /api/decks/[id]` | `src/app/api/decks/[id]/route.ts` | ✅ Cascade-deletes flashcards/sessions via FK |
| `POST /api/quiz/[id]` | `src/app/api/quiz/[id]/route.ts` | ✅ Server-side question builder; same-category MC distractors; creates `quiz_sessions` row |
| `POST /api/quiz/result` | `src/app/api/quiz/result/route.ts` | ✅ Rate-limited; one atomic `submit_quiz_result` RPC; **score re-derived server-side** from `flashcards.back` (2026-06-10) |
| `POST /api/payment/submit` | `src/app/api/payment/submit/route.ts` | ✅ 13-digit ref + amount/method validation; 2/24h; one pending per user; never auto-activates Pro |
| `GET /api/admin/payments` | `src/app/api/admin/payments/route.ts` | ✅ `requireAdmin`; joins `userEmail`; computes `minutesSinceSubmission` |
| `POST /api/admin/payments/approve` | `src/app/api/admin/payments/approve/route.ts` | ✅ atomic `approve_payment` RPC (verify → Pro → +30 credits → audit) |
| `POST /api/admin/payments/reject` | `src/app/api/admin/payments/reject/route.ts` | ✅ atomic `reject_payment` RPC (reason shown to student) |
| `POST /api/referral/claim` | `src/app/api/referral/claim/route.ts` | ✅ atomic `claim_referral` RPC (single source w/ `auth/callback`); unique-index backstop (2026-06-10) |

> **Frontend feature gaps** (advertised but unbuilt: Living Decks, Deep Dive, PDF export,
> the non-signup reward methods, deck/card editing, etc.) are catalogued in
> **`docs/MISSING_FEATURES.md`**.

### Configuration & dependencies

- `.env.local` holds live Supabase keys (URL, anon key, service-role key); it is gitignored
  and never committed. **Every new machine/clone needs its own `.env.local`.**
- Added: `@supabase/ssr` (cookie session for App Router), `zod` (request validation).

---

## 3. Data-access / integration layer

A typed data-access layer that feature routes build on, so handlers call small typed helpers
instead of re-deriving Supabase queries, RPC calls, rate-limit plumbing, and error handling.

**Lives in:** `src/lib/db/*` (helpers + DB error mapping), `src/lib/api/errors.ts` (shared
route response/error handler), `src/lib/db/validate.ts` (write-path guards), `schema.sql`
(the Postgres functions/triggers/RLS it depends on). Tests: `tests/*.test.ts` (Vitest,
Supabase mocked).

### Modules

| File | Responsibility |
|---|---|
| `src/lib/db/errors.ts` | `DbError` (carries `ApiErrorCode` + HTTP status); `toDbError()` maps SQLSTATEs (23505/23514/23503) and `RAISE EXCEPTION` sentinels to typed errors; logs raw cause on 500-class faults. |
| `src/lib/api/errors.ts` | `handleApiError(err)` standard route `catch` (AuthError→401/403, DbError→its code, ZodError→400, unknown→opaque 500); `apiSuccess<T>()`. |
| `src/lib/db/rpc.ts` | Service-role wrappers: `deductCredit`, `grantCredits`, `checkReferralCap`, `claimReferral` (atomic referral attribution). |
| `src/lib/db/rate-limit.ts` | `checkRateLimit` / `enforceRateLimit` (reads `RateLimits[endpoint]`). |
| `src/lib/db/profiles.ts` | `updateOwnProfile` (whitelisted), `getProfileIdByReferralCode`. |
| `src/lib/db/decks.ts` | deck CRUD incl. `createDeckWithCardsAndCharge` (atomic RPC — insert + cards + `card_count` + `deduct_credit` in one txn). |
| `src/lib/db/flashcards.ts` | `insertFlashcards`, `getFlashcardsForDeck`, `getWeakCardsForDeck`, `applyCardReview` (atomic RPC). |
| `src/lib/db/quiz.ts` | `createQuizSession`, `submitQuizResult` (atomic RPC — answers + card stats + finalize). |
| `src/lib/db/payments.ts` | `createPaymentSubmission`. |
| `src/lib/db/referrals.ts` | `listReferralEventsForCurrentUser`. |
| `src/lib/db/admin.ts` | `listPendingPayments`, `approvePayment`, `rejectPayment` (atomic RPCs). |

> **Note (2026-06-10):** unused, untested helpers were pruned — `getProfileById`,
> `setReferredBy`, `updateDeckCardCount`, `getQuizSessionById`, `getPaymentById`,
> `listUserPayments`, `logReferralEvent`. The referral ledger insert now happens inside
> the `claim_referral` RPC, not a separate `logReferralEvent` call.
| `src/lib/db/validate.ts` | `ensureMaxLength`, `ensureMaxItems` write-path guards. |
| `src/lib/db/index.ts` | Barrel — import from `@/lib/db`. |

**Conventions:** each helper picks its client — **session client** (RLS) for user-scoped ops;
**service-role** for credit/rate-limit RPCs, `referral_events` inserts, and admin verify/reject.
Every helper throws `DbError`; routes wrap in `handleApiError`. Admin helpers do **no** authz —
gate behind `requireAdmin()` first. Multi-write atomic flows live in `SECURITY DEFINER`
Postgres functions (supabase-js issues one HTTP request per call, no multi-statement txns).

### Hardening passes (history)

- **C1** — `token_balance` / `subscription_expires_at` were user-writable via the profiles
  UPDATE policy → added `protect_immutable_profile_fields()` trigger + whitelist payload.
- **C2** — referral lookup returned another user's full profile → `getProfileIdByReferralCode`
  returns only the id.
- **H1** — admin approval was 3 non-atomic writes → `approve_payment`/`reject_payment`
  `SECURITY DEFINER` (atomic claim → tier → audit), with renewal-stacking expiry.
- **H2** — `applyCardReview` read-modify-write race → `apply_card_review` RPC (atomic).
- **M2** — `approve_payment` also grants the Pro monthly allotment (30 credits) in-txn.
- **M4** — `validate.ts` enforces `contracts.Validation` length/count limits before any DB call.
- 5xx logging — `toDbError` logs the raw `PostgrestError` on fallback branches; `handleApiError`
  logs any `DbError` with status ≥ 500.

### Residual / deferred (from the layer's reviews)

- **Operational:** `schema.sql` must be (re)applied to the live project for the C1 guard and
  the `approve_payment`/`reject_payment`/`apply_card_review` functions to exist.
- `as` casts throughout (fix = generated Supabase types — intentionally deferred during active
  schema work).
- No automated tests for the DB functions themselves (recommend pgTAP / test-DB integration).
- `deduct + persist` still non-atomic (target: `create_deck_with_cards_and_charge()` for #5).
- Validation enforces max length only — empty/blank `front`/`back` still pass.

### Test status (integration layer)

Vitest: ~60 tests across 9 files passing (Supabase mocked). `tsc --noEmit` and `eslint src/lib tests`
clean. Integration tests (`npm run test:int`) need a live/local Supabase and were not run.

---

## 4. Database setup history & gotchas

Three issues were diagnosed and fixed during initial setup.

### Issue A — Wrong Supabase URL format
`.env.local` had `/rest/v1/` appended. The client needs the **base** project URL only:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co/rest/v1/   ← wrong
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co            ← correct
```

### Issue B — Schema paste corruption
Pasting `schema.sql` copied **from the chat window** corrupted keywords (e.g. `SECURITY DEFINER`
→ `SECURITY DEFINE`) and leaked label text. **Lesson:** always copy SQL from the actual
`schema.sql` file, never from a chat/terminal. (`schedule N` as the final editor result is just
the cron job's return value — success, not an error.)

### Issue C — THE MAIN BUG: "Database error saving new user" (search_path)
**Symptom:** every signup returned HTTP 500 — `Database error saving new user`.
**Root cause:** the `handle_new_user` trigger runs with `SET search_path = public`. It called
`generate_unique_referral_code()`, which used `gen_random_bytes()` from the **pgcrypto** extension
(in the `extensions` schema, *not* on the public-only path). Inside the trigger the function
wasn't found, so the trigger threw. It was confusing because calling the function directly in the
SQL Editor worked (the dashboard's path includes `extensions`).
**Fix:** rewrote `generate_unique_referral_code()` to use core `gen_random_uuid()` (in
`pg_catalog`, always on path):
```sql
code := upper(substring(replace(gen_random_uuid()::text, '-', '') FROM 1 FOR 8));
```
**Rule going forward:** any function called from a `SET search_path = public` trigger must not use
unqualified functions from the `extensions` schema.

---

## 5. Local testing guide

```bash
npm run dev          # http://localhost:3000 (leave running)
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm test             # vitest run (unit)
npm run test:int     # integration tests (needs Supabase env)
```

**Smoke-test signup** (second terminal — use a REAL email; Supabase rejects `@example.com`/
`@test.com`):
```
curl -X POST http://localhost:3000/api/auth/signup -H "Content-Type: application/json" \
  -d "{\"email\":\"you@gmail.com\",\"password\":\"password123\"}"
```
Success → `{"success":true, ...}` and `POST /api/auth/signup 200` in the dev log. Then check
**Table Editor → profiles**: a row appears with `token_balance = 3` and an 8-char `referral_code`
— proving env → connection → schema → `handle_new_user` trigger → defaults all work.

**Useful checks (SQL Editor):**
```sql
-- list tables (expect 9)
SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1;
-- promote a user to admin
UPDATE public.profiles SET is_admin = true WHERE email = 'you@gmail.com';
```

**Resetting during testing:** delete test users in Dashboard → Authentication → Users;
toggle off "Confirm email" under Auth → Providers → Email while developing (re-enable for prod);
add `http://localhost:3000/api/auth/callback` under Auth → URL Configuration.

---

## 6. Auth operations runbook — rescuing stuck / unconfirmed users

The most common support issue: a user **signed up but can't get in**. Most cases are now
self-serve (resend confirmation); this is the manual fallback. Run SQL via the Supabase SQL
Editor or the Supabase MCP. **Try the steps in order — least to most destructive.**

### Why users get stuck
- If an email **already exists**, a new signup returns `user_repeated_signup` (HTTP 200) and
  sends **no** email (anti-enumeration). A user who never confirmed can't re-trigger the email
  by signing up again — they must log in or reset.
- An **unconfirmed** user (`email_confirmed_at IS NULL`) can't log in.
- An **orphaned** user = `auth.users` row with no `public.profiles` row. The app now self-heals
  this on login via `ensure_profile()`, but you can fix it manually too.

### Step 0 — Diagnose
```sql
select u.id, u.email, u.created_at,
       u.email_confirmed_at,                              -- null = NOT confirmed
       (u.raw_user_meta_data->>'full_name') as meta_full_name,
       p.id is not null as has_profile
from auth.users u
left join public.profiles p on p.id = u.id
where u.email = 'USER_EMAIL_HERE';
```

### Step 1 — Self-serve resend (preferred, no admin action)
Point the user at the **signup success screen → "Resend confirmation email"**, or:
```
POST /api/auth/resend-confirmation   { "email": "USER_EMAIL_HERE" }
```
Enumeration-safe; re-sends the signup confirmation for unconfirmed accounts. Supabase applies
its own per-email rate limit — wait a few minutes if nothing arrives, and **check spam**. If
email never arrives for *any* user, it's an SMTP/config issue (Dashboard → Authentication →
Emails/SMTP; the built-in sender has a low hourly cap — production should set custom SMTP).

### Step 2 — Manually confirm the email (admin)
```sql
update auth.users set email_confirmed_at = now()
where email = 'USER_EMAIL_HERE' and email_confirmed_at is null;
```
(Equivalent: GoTrue admin API `auth.admin.updateUserById(id, { email_confirm: true })`.)

### Step 3 — Backfill a missing profile (orphan)
Recreated automatically on next login; to do it now:
```sql
select public.ensure_profile('USER_UUID_HERE'::uuid);   -- idempotent
select id, email, full_name, course, consent_deepseek, token_balance
from public.profiles where id = 'USER_UUID_HERE'::uuid;  -- verify
```

### Step 4 — Delete + re-register (last resort, destructive)
```sql
delete from auth.users where id = 'USER_UUID_HERE'::uuid;   -- scope to ONE id; cascades
```
Then verify cleanup:
```sql
select (select count(*) from auth.users) as auth_users,
       (select count(*) from public.profiles) as profiles,
       (select count(*) from auth.users u left join public.profiles p on p.id=u.id
          where p.id is null) as orphans;  -- expect 0
```

### Reference — functions
- `handle_new_user()` — trigger on `auth.users` insert; the **only** place profiles are
  provisioned on signup; reads name/course/consent from `raw_user_meta_data`.
- `ensure_profile(uuid)` — self-heal RPC; mirrors `handle_new_user` defaults; called by the
  login route when a profile is missing. **Keep the two in lockstep.**
- Canonical definitions live in `schema.sql` (§4). **Editing `schema.sql` does not change the
  live DB** — re-apply via a Supabase migration / the SQL Editor.

---

## 7. Change log / session history

### 2026-05-31 — git reconciliation, attribution cleanup, test pass
- **Reconciled a diverged `main`** (4 local vs 6 remote commits) *without* force-push: carried
  the staged merge resolution onto branch `auth-ocr`, concluded a proper two-parent merge,
  fast-forwarded `main`, pushed clean. No commits lost. Conflicts resolved: `contracts.ts`,
  `package.json`, `src/lib/api/errors.ts`, `src/lib/supabase/server.ts`.
- Created `auth-ocr` checkpoint branch.
- Stripped `Co-Authored-By: Claude` trailers from 4 commits via `git filter-branch` across
  `main`, `auth-ocr`, `feature/auth` (code byte-for-byte identical; branches force-pushed →
  collaborators must re-fetch/reset). Commit identity: `kauhla321 <cjalcazar123@gmail.com>`.
- **Tests at `c9b8a0f`:** typecheck ✅, unit `npm test` ✅ (9 files / 60 tests), lint ✅
  (4 unused-import warnings), build ✅ (11 routes). Integration tests not run (need Supabase env).
- Follow-ups noted then: remove 4 unused imports; migrate `middleware` → `proxy` (done since);
  run integration tests against local Supabase.

### 2026-06-06 — dev memory, registration, stuck-confirmation recovery

**Bug #1 — `npm run dev` ate ~8 GB RAM and lagged.** Three compounding causes:
1. **Config silently ignored** — an empty `next.config.mjs` shadowed `next.config.ts`
   (Next loads the first of `[next.config.js, .mjs, .ts]`), so every optimization was inert.
2. **Wrong workspace root** — a stray parent-folder `package-lock.json` made Turbopack infer
   the parent dir as root, widening module resolution + file watching.
3. **Route preloading on boot** — Next preloads every route's modules at dev-server start.
   **Fix:** deleted `next.config.mjs`; rewrote `next.config.ts` with `turbopack.root = <project>`,
   `serverExternalPackages: ["pdfjs-dist"]`, `experimental.preloadEntriesOnStart: false`.
   **Not the cause** (corrected mid-investigation): it was never Webpack (Turbopack is the v16
   default); `optimizePackageImports` doesn't apply to dynamic `await import()`; `tesseract.js`
   in `serverExternalPackages` is a no-op (client-only); `eng.traineddata` is not a memory driver.
   **Watch out:** never keep two `next.config.*` files (`.mjs`/`.js` shadow `.ts`); this app is
   Next.js, *not* Vite. Optional: cap heap with `NODE_OPTIONS=--max-old-space-size=4096`.

**Bug #2 — registration "not working."** The signup route masked *every* Supabase error as a
generic 500, hiding the real reason (e.g. Supabase rejecting reserved test domains). Plus three
data bugs: `course` was dropped (form→API), `consent_deepseek` was misspelled `consentDeeseek`
and never stored, and `handle_new_user()` ignored signup metadata.
**Fix:** signup route now maps Supabase errors to real codes (`VALIDATION_ERROR`, `RATE_LIMITED`)
while keeping enumeration-safe masking for already-registered; forwards `full_name`/`course`/
`consent_deepseek` as metadata; the form sends `course` + correctly-spelled `consentDeepseek`;
and `handle_new_user()` reads the metadata. Trigger **applied live** via MCP migration
`fix_handle_new_user_metadata`.

**Bug #2 follow-up — "no email / won't save."** Not a code bug: the test email already existed
as a confirmed account, so every re-signup was a `user_repeated_signup` no-op (no email, no row),
and that account was **orphaned** (no profile row). Resolved by deleting the single orphaned auth
user so the email was reusable (auth.users 4→3, profiles 3, orphans 0).

**Hardening — stuck-confirmation recovery + self-healing profiles** (so this never needs a manual
delete again):
- **Resend confirmation:** new enumeration-safe `POST /api/auth/resend-confirmation`
  (`auth.resend({ type: "signup" })`), `ApiPaths.authResendConfirmation` in contracts, and a
  "Resend confirmation email" button on the signup success screen.
- **Self-healing profile:** new `ensure_profile(uuid)` (SECURITY DEFINER, mirrors
  `handle_new_user`, `ON CONFLICT (id) DO NOTHING`), applied live via MCP migration
  `add_ensure_profile`; the login route calls it when the profile fetch returns null, then
  re-fetches (non-blocking).
- Docs: this runbook (§6) and `docs/TODO.md`.
- Verified: `npm run typecheck` clean; `ensure_profile` exists live and is idempotent.

**Files touched (2026-06-06)**

| File | Area | Status |
|---|---|---|
| `next.config.mjs` | dev RAM | **deleted** (was shadowing `.ts`) |
| `next.config.ts` | dev RAM | rewritten (workspace root + server-external + no preload) |
| `src/app/api/auth/signup/route.ts` | registration | error mapping + metadata forwarding |
| `src/app/signup/page.tsx` | registration / resend | sends `course` + `consentDeepseek`; resend button |
| `src/app/api/auth/login/route.ts` | self-heal | calls `ensure_profile` when profile missing |
| `src/app/api/auth/resend-confirmation/route.ts` | resend | **new** enumeration-safe route |
| `src/lib/contracts.ts` | contracts | `authResendConfirmation` path; `App.version` → v.03 |
| `schema.sql` | DB | `handle_new_user()` metadata + new `ensure_profile()` |
| `FRONTEND.md` | docs | known-fixes entries + v.03 history row |

**Live DB migrations applied (`gjrdlmxlqngqcnflygcp`)**

| Migration | Effect |
|---|---|
| `fix_handle_new_user_metadata` | trigger reads name/course/consent from signup metadata |
| `add_ensure_profile` | added `ensure_profile(uuid)` self-heal function |
| (manual) `delete from auth.users …` | removed the one orphaned account so the email is reusable |

**Still outstanding (user side):** re-register `cjalcazar123@gmail.com` with a real email +
name/course/consent and confirm via the email link (was blocked by the Supabase email rate
limit — wait it out), then verify the profile row. Deferred dev items live in `docs/TODO.md`.

### 2026-06-06 (sessions 2–3) — auth UX, OCR, AI generation, deck + quiz API

TODO items 1–7 completed across two back-to-back sessions. All 60 Vitest tests pass; `tsc --noEmit` clean throughout.

**Item 1 — Login "not confirmed" UX (enumeration-safe)**
- Login page (`src/app/login/page.tsx`) shows a passive "Resend confirmation email" affordance
  at all times (not gated on a failed login — that would leak whether an account exists).
- After a failed login the affordance is additionally promoted (more visible but same text —
  still no hint about the account's existence).
- Posts to the already-built `POST /api/auth/resend-confirmation`.

**Item 2 — Forgot/reset password backend + frontend spec**
- `POST /api/auth/forgot-password` and `POST /api/auth/reset-password` routes existed; added
  the missing `ApiPaths.authForgotPassword`, `ApiPaths.authResetPassword`, and
  `Routes.forgotPassword` constants to `contracts.ts`.
- Wrote a full frontend build spec in `FRONTEND.md` (6-step flow diagram, Piece 1:
  `/forgot-password` page, Piece 2: `/settings?mode=reset-password` handler). The `/forgot-password` link on the login page still 404s — frontend task, spec is ready.

**Item 3 — OCR accuracy for mixed PDFs**
- **`src/lib/pdf/extract-text-server.ts`** — rewritten with per-page classification:
  a page is "sparse" (image) if it has < 100 chars. `isImagePdf` now fires when ≥ 3 sparse
  pages OR > 10 % of the document is sparse — catches mixed PDFs the old average-based check
  silently dropped. Returns `imagePageNumbers[]` and `partialText` (text from non-sparse pages).
- **`src/lib/pdf/render-pages-client.ts`** — added optional `pageNumbers[]` param so OCR
  only renders the sparse pages, not the entire document.
- **`src/lib/pdf/ocr-client.ts`** — switched to `OEM.LSTM_ONLY` + `PSM.AUTO` (Tesseract v7).
- **`src/components/upload/PdfUploadFlow.tsx`** — merges `partialText` (from non-sparse pages)
  with the OCR result; if OCR fails but partial text exists, uses partial text rather than
  dropping to the paste fallback.
- **`src/app/api/upload/route.ts`** — extended debug type; returns `partialText` +
  `imagePageNumbers` in OCR responses.

**Item 4 — DeepSeek categorised JSON output + `category` schema migration**
- `contracts.ts`: added `category: string` to `GeneratedCard` and `Flashcard`.
- `schema.sql`: added `category TEXT NOT NULL DEFAULT ''` to `flashcards`.
- `src/lib/deepseek/generate-cards.ts`: new categorised prompt; `parseCategorisedPayload`
  flattens `categories[*].cards` → `GeneratedCard[]` with `category` attached; falls back to
  flat format with `"General"` for robustness. Always forces English output in the system prompt.
- `src/lib/db/flashcards.ts` + `src/app/api/generate/route.ts`: pass `category` through to
  DB inserts.
- Test fixtures updated in `tests/decks.test.ts` and `tests/validation.test.ts`.

**Item 5 — Wire `/api/generate` out of test mode**
- `src/lib/dev/pdf-test-mode.ts`: flag flipped to `false`.
- `src/app/api/generate/route.ts` — complete rewrite:
  - Removed `PDF_EXTRACTION_TEST_MODE` early-exit block and `isPersistenceEnabled()` preview path.
  - Auth always required; pre-checks `token_balance > 0` before the DeepSeek call (fail fast).
  - `countDecksForUser()` + `TierLimits[tier].maxDecks` enforced before DeepSeek for free tier.
  - `createDeckWithCards()` replaces inline deck + flashcard inserts.
  - `deductCredit()` from `src/lib/db/rpc.ts` called **after** persistence succeeds; compensating
    `deleteDeck()` if credit deduction then fails.
  - Unused imports removed: `TableNames`, `GenerationMode`, `createServiceClient`.
- `contracts.ts`: added `UIMessages.outOfCredits` + `UIMessages.deckLimitReached`.

**Item 6 — Deck API routes**
- New `src/app/api/decks/route.ts` — `GET /api/decks`: `requireAuth()` + `listDecksForUser()`.
- New `src/app/api/decks/[id]/route.ts`:
  - `GET`: `getDeckWithCards()` via session client (RLS); returns 404 for non-owned or missing
    decks — same response in both cases so ownership is not leaked.
  - `DELETE`: `getDeckById()` pre-check → 404 → `deleteDeck()` → `{ deckId }`. Pre-check is
    needed because `deleteDeck()` silently no-ops on an unowned row.
- Both use `requireAuth()` + `handleApiError()` pattern.
- **Remaining frontend work (item 6b in TODO):** `dashboard/page.tsx` and `decks/[id]/page.tsx`
  still read Supabase directly — they should be migrated to call these routes.

**Item 7 — Quiz system (server-side)**
- New `src/app/api/quiz/[id]/route.ts` — `POST /api/quiz/:deckId`:
  - Deck ownership verified via RLS; loads cards; builds questions server-side.
  - MC distractors prefer same-category cards (pedagogically coherent); falls back to other
    categories. Requires ≥ 4 cards for MC; otherwise forces identification.
  - Creates `quiz_sessions` row; returns `{ sessionId, questions }` with `correctAnswer`
    included (frontend hides it until after the student answers).
- New `src/app/api/quiz/result/route.ts` — `POST /api/quiz/result`:
  - Rate-limited (30/hr). Session ownership via RLS. Guards double-submit (`completed_at ≠ null → 409`).
  - Fetches current card difficulty scores; computes new score (`−0.15` correct / `+0.25` wrong,
    clamped `[0, 1]`); calls `apply_card_review()` per card (atomic RPC, SECURITY INVOKER).
  - `insertQuizAnswers()` then `completeQuizSession()`. `livingDeckRefreshTriggered: false` —
    wired for TODO 8.
- `src/app/quiz/[deckId]/page.tsx` — migrated:
  - Deck now loaded from `GET /api/decks/[id]` (no more Supabase browser client direct read).
  - "Start Quiz" calls `POST /api/quiz/[deckId]` — questions come from the server.
  - "Finish Quiz" calls `POST /api/quiz/result`, stores combined API + local answer data in
    `sessionStorage`, navigates to result page.
  - New `"starting"` and `"submitting"` phases for async feedback.
  - Removed: `buildQuestions()`, `shuffled()`, `cards` state, `getSupabaseBrowserClient` import.

**Files touched (sessions 2–3)**

| File | Change |
|---|---|
| `src/app/login/page.tsx` | Resend confirmation affordance (always-visible + post-failure promoted) |
| `src/lib/contracts.ts` | `authForgotPassword`, `authResetPassword`, `forgotPassword` route; `category` on `GeneratedCard` + `Flashcard`; `UploadResult` OCR shape; `UIMessages.outOfCredits` + `deckLimitReached` |
| `FRONTEND.md` | Forgot/reset password frontend spec; route table updates |
| `src/lib/pdf/extract-text-server.ts` | Per-page sparse classification; `imagePageNumbers`; `partialText` |
| `src/lib/pdf/render-pages-client.ts` | Optional `pageNumbers[]` for selective rendering |
| `src/lib/pdf/ocr-client.ts` | LSTM_ONLY + PSM.AUTO |
| `src/components/upload/PdfUploadFlow.tsx` | Selective OCR; partial-text merge; smarter fallback |
| `src/app/api/upload/route.ts` | Extended debug type; returns `partialText` + `imagePageNumbers` |
| `src/lib/deepseek/generate-cards.ts` | Categorised prompt + `parseCategorisedPayload` |
| `src/lib/db/flashcards.ts` | `category` in insert rows |
| `schema.sql` | `category TEXT NOT NULL DEFAULT ''` on flashcards |
| `src/lib/dev/pdf-test-mode.ts` | Flag → `false` |
| `src/app/api/generate/route.ts` | Full rewrite — real auth, tier/deck-limit checks, data-access layer |
| `src/app/api/decks/route.ts` | **New** — `GET /api/decks` |
| `src/app/api/decks/[id]/route.ts` | **New** — `GET` + `DELETE /api/decks/[id]` |
| `src/app/api/quiz/[id]/route.ts` | **New** — `POST /api/quiz/:deckId` |
| `src/app/api/quiz/result/route.ts` | **New** — `POST /api/quiz/result` |
| `src/app/quiz/[deckId]/page.tsx` | Migrated to API-based (no Supabase direct, no client-side question building) |
| `tests/decks.test.ts`, `tests/validation.test.ts` | Added `category: "General"` to fixtures |
| `docs/TODO.md` | Items 1, 3–7 marked ✅; item 6b added; item 8 unblocked note; items 9–11 tightened |

### 2026-06-06 (session 4) — rate limiting silently disabled (duplicate `checkRateLimit`)

**Bug — `check_rate_limit` RPC never resolved; rate limiting did nothing.** Logs showed:
```
check_rate_limit RPC failed: Could not find the function
public.check_rate_limit(p_endpoint, p_user_id) in the schema cache
```
**Root cause:** two `checkRateLimit` implementations had diverged.
- **Canonical (correct):** `src/lib/db/rate-limit.ts` — looks up `RateLimits[endpoint]` and calls
  the RPC with all **four** args the DB function declares (`schema.sql` §4.9):
  `p_user_id, p_endpoint, p_window_minutes, p_max_requests`. Tested in `tests/rate-limit.test.ts`.
- **Stale duplicate (broken):** `src/lib/supabase/server.ts` — called the RPC with only **two**
  args (`p_user_id, p_endpoint`). PostgREST resolves RPCs by exact argument signature, so no 2-arg
  overload existed → the "schema cache" error. Worse, it **failed open**
  (`return { allowed: true }` on error), so the request silently succeeded with no limit applied.

The handlers that actually enforce limits — `src/app/api/upload/route.ts`,
`src/app/api/generate/route.ts`, `src/app/api/quiz/result/route.ts` — all imported the **broken**
version from `@/lib/supabase/server`. That is why uploads/generation "worked" while the error was
logged: the limit was never checked.

**Fix:** deleted the broken duplicate in `server.ts` and replaced it with a re-export of the
canonical implementation, so there is one source of truth and every existing import still resolves:
```ts
export { checkRateLimit, enforceRateLimit } from "@/lib/db/rate-limit";
```
The canonical version returns the same `RateLimitResult` (`{ allowed, remaining }`) the routes
already consume via `rate.allowed`, and it throws a typed `DbError` on a genuine DB failure instead
of failing open — the route handlers are already wrapped in try/catch, so a real failure now
surfaces instead of silently disabling the limit. `createServiceClient` stays defined in
`server.ts` (still used by other helpers).

**No DB change** — the `check_rate_limit` function (`schema.sql` §4.9) was already correct; the bug
was entirely on the calling side.

**Verified:** `npm run typecheck` clean; `tests/rate-limit.test.ts` 5/5 pass (already asserts the
RPC is called with all four params).

**Watch out:** never reimplement a DB-backed helper that already lives in `src/lib/db/*` — import
or re-export it. A second copy with a mismatched RPC arg list fails the PostgREST signature lookup,
and a fail-open `catch` hides it.

**Files touched (session 4)**

| File | Change |
|---|---|
| `src/lib/supabase/server.ts` | Removed broken 2-arg `checkRateLimit`; re-exports canonical `checkRateLimit` / `enforceRateLimit` from `@/lib/db/rate-limit` |

### 2026-06-06 (session 5) — backend audit → Phase 1 (auth unification + cleanups) & Phase 2 (atomic RPCs + RPC-grant security fix)

A backend audit (security / correctness / performance) split into two phases by the user
("do 1 first, test, then do 2"). Every finding was verified against the real code first — several
sub-agent findings were **false positives** and were *not* actioned: `.env.local` is gitignored &
untracked (no leaked secret); DeepSeek errors never reach users (the generate route always returns
the generic `aiUnavailable`); credit handling was already safe (deduct-after-persist + compensating
delete). Verified green throughout: `tsc --noEmit` clean, Vitest 60/60, `next build` (25 routes),
Supabase advisors.

**Phase 1 — TypeScript-only (no DB migration)**
- **Unified `/api/generate` + `/api/upload` onto `requireAuth()`** (cookie/session + RLS),
  replacing the old Bearer-token + service-role profile-read path (two identity sources in one
  request — fragile: a valid token + missing cookie → RLS 500 instead of a clean 401). Deleted the
  now-dead `getUserFromRequest` / `getProfileForUser` / `createServiceClient` from
  `src/lib/supabase/server.ts` — `createAdminClient` (`admin.ts`) is now the only service-role
  factory, used solely by the privileged RPC wrappers.
- `src/proxy.ts` now uses `TableNames.profiles` (was a hardcoded `"profiles"` — contract violation).
- `deleteDeck` returns the deleted-row count; `DELETE /api/decks/[id]` dropped the `getDeckById`
  pre-check (one round-trip; the RLS-scoped delete returns 0 → 404 without leaking existence).
- `/api/generate`: added `export const maxDuration = 60`; lowered `DEEPSEEK_REQUEST_TIMEOUT_MS`
  120s → 45s so the timeout × retry budget fits the serverless function limit (no mid-call kill).
- Login rate-limit: comment clarified — it's a post-success, per-user throttle, **not** brute-force
  protection (GoTrue's built-in limits are the backstop). No behavior change.
- **Dashboard fix** (the "the deck wasn't created? I have to add the source again" report): the
  deck *always* persisted — `src/app/dashboard/page.tsx` was a static mockup that fetched only the
  profile and hardcoded "No decks yet", never querying `decks`. Wired it to list real decks
  (parallel profile + decks fetch, RLS-scoped) with an empty-state vs. deck-grid. Resolves the
  dashboard half of item 6b (the deck-detail page is still Supabase-direct).

**Phase 2 — atomicity via SECURITY-context RPCs (DB migration)**
- **`submit_quiz_result(p_session_id uuid, p_answers jsonb)`** — `SECURITY INVOKER`,
  `SET search_path = public`. One transaction: locks the session `FOR UPDATE`, re-checks
  `completed_at`, inserts all answers, set-based updates each reviewed card's stats, and finalizes
  the session. Closes the **double-submit race** that could double-apply card reviews (corrupting
  `times_seen` / `difficulty_score`, which drive Living Deck selection). The difficulty-nudge
  formula (`−0.15` correct / `+0.25` wrong, clamped `[0,1]`) moved into SQL. `quiz/result/route.ts`
  collapsed to one RPC call (+ rate-limit + validation); new `submitQuizResult` wrapper in
  `src/lib/db/quiz.ts`; removed the non-atomic `insertQuizAnswers` / `completeQuizSession`.
- **`create_deck_with_cards_and_charge(...)`** — `SECURITY DEFINER`, `SET search_path = public`,
  `auth.uid()` self-guard. Deck insert + card inserts + `card_count` sync + `deduct_credit()` all
  commit in **one transaction**; `INSUFFICIENT_CREDITS` (or any failure) rolls the whole thing back
  — no orphan deck, no uncharged generation. Implements the long-standing `TODO(#5 generate)`.
  DEFINER (not INVOKER) so it can call the now-locked-down `deduct_credit()` as owner; the
  `auth.uid()` guard + writing every row with that id keep it safe despite bypassing RLS. New
  `createDeckWithCardsAndCharge` wrapper in `src/lib/db/decks.ts`; `generate/route.ts` uses it (the
  deduct-last + compensating-delete dance removed); removed `createDeckWithCards`. `deductCredit`
  is kept as a standalone service-role primitive.
- `toDbError` (`src/lib/db/errors.ts`) gained `RAISE EXCEPTION` sentinels: `SESSION_NOT_FOUND` →
  FORBIDDEN/404, `ALREADY_SUBMITTED` → VALIDATION_ERROR/409, `NO_ANSWERS` → VALIDATION_ERROR/400.
- `tests/decks.test.ts` rewritten to cover `createDeckWithCardsAndCharge` (happy path +
  INSUFFICIENT_CREDITS → typed DbError).

**🔴 SECURITY FIX (found mid-Phase-2) — privileged RPCs were callable by anon / authenticated**
The `SECURITY DEFINER` money/tier/audit functions had `EXECUTE` granted to `anon` **and**
`authenticated` on the PostgREST RPC surface (PostgreSQL's default PUBLIC grant + Supabase's
anon/authenticated default privileges). A logged-in — or even anonymous — client could call them
directly:
- `rpc('grant_credits',   { p_user_id: <self>,   p_amount: 999999 })` → unlimited free credits
- `rpc('approve_payment', { … })`                                     → self-upgrade to Pro
- `rpc('deduct_credit',   { p_user_id: <victim> })`                   → drain another user's credits

They run as the owner (`postgres`), so the `protect_immutable_profile_fields` /
`block_privilege_escalation` triggers (which let the owner through) do **not** stop them — this
bypassed the entire credit/payment economy. Every one is only ever called server-side via the
service-role client. **Fix:** revoked `EXECUTE` from `PUBLIC` / `anon` / `authenticated` on
`deduct_credit`, `grant_credits`, `check_rate_limit`, `check_referral_cap`, `approve_payment`,
`reject_payment`, `ensure_profile` (service_role kept). The two new Phase 2 RPCs are anon-revoked
too; `create_deck_with_cards_and_charge` stays callable by `authenticated` (the session client) —
its `auth.uid()` guard makes that safe. Verified with `has_function_privilege`: anon/authenticated
EXECUTE is now `false` on all seven; `is_current_user_admin` / `apply_card_review` /
`submit_quiz_result` remain reachable as required. `schema.sql` updated (§4.13–4.15).

**Verification gap (by design):** the two RPCs were not exercised end-to-end against live rows —
the Claude Code auto-mode guardrail blocked reading/mutating production user data (PII). Confidence
rests on unit tests + structural atomicity (a plpgsql function body is a single transaction; any
`RAISE` aborts it) + the privilege checks. Remaining manual check: log in, generate a deck, submit
a quiz twice → the 2nd submit returns 409 and the card stats change exactly once.

**Files touched (session 5)**

| File | Phase | Change |
|---|---|---|
| `src/app/api/generate/route.ts` | 1+2 | `requireAuth()`; `maxDuration = 60`; uses `createDeckWithCardsAndCharge` (removed deduct-last + compensating-delete + `DbError`/`genericInternalError` imports) |
| `src/app/api/upload/route.ts` | 1 | `requireAuth()` + `handleApiError`; removed dead `MAX_BYTES` |
| `src/lib/supabase/server.ts` | 1 | deleted dead `getUserFromRequest` / `getProfileForUser` / `createServiceClient` |
| `src/proxy.ts` | 1 | `.from(TableNames.profiles)` |
| `src/app/api/decks/[id]/route.ts` | 1 | DELETE drops the pre-check (RLS-scoped delete → 404) |
| `src/lib/deepseek/client.ts` | 1 | `DEEPSEEK_REQUEST_TIMEOUT_MS` 120s → 45s |
| `src/app/api/auth/login/route.ts` | 1 | rate-limit comment clarified (no behavior change) |
| `src/app/dashboard/page.tsx` | 1 | lists real decks (was a static mockup); `Link` + `Routes`/`TableNames` |
| `src/lib/db/quiz.ts` | 2 | added `submitQuizResult`; removed `insertQuizAnswers` / `completeQuizSession` |
| `src/app/api/quiz/result/route.ts` | 2 | collapsed to one atomic `submitQuizResult` RPC call |
| `src/lib/db/decks.ts` | 2 | added `createDeckWithCardsAndCharge`; removed `createDeckWithCards` |
| `src/lib/db/rpc.ts` | 2 | `deductCredit` doc updated (kept as standalone service-role primitive) |
| `src/lib/db/errors.ts` | 2 | new sentinels: `SESSION_NOT_FOUND` / `ALREADY_SUBMITTED` / `NO_ANSWERS` |
| `src/lib/db/index.ts` | 2 | barrel — swapped removed/added exports |
| `schema.sql` | 2 | §4.13 `submit_quiz_result`, §4.14 `create_deck_with_cards_and_charge`, §4.15 EXECUTE lockdown; header notes |
| `tests/decks.test.ts` | 2 | rewritten for `createDeckWithCardsAndCharge` |

**Live DB migrations applied (`gjrdlmxlqngqcnflygcp`)**

| Migration | Effect |
|---|---|
| `add_atomic_quiz_and_generate_rpcs` | created `submit_quiz_result` + `create_deck_with_cards_and_charge` |
| `harden_privileged_function_grants` | revoked anon/authenticated EXECUTE on 7 service-role-only `SECURITY DEFINER` functions |
| `harden_phase2_rpc_search_path_and_anon` | pinned `submit_quiz_result` search_path; revoked anon on both new RPCs |

**Advisors after Phase 2:** no new issues from the two functions. Remaining warnings are
pre-existing or intentional: `rate_limit_log` deny-all RLS (by design), a few
`function_search_path_mutable` on older functions, `is_current_user_admin` DEFINER (RLS needs it),
the single intentional "authenticated can execute a `SECURITY DEFINER` function" flag on
`create_deck_with_cards_and_charge`, and Supabase Auth "leaked password protection disabled"
(a dashboard toggle, not code).

**Watch out:** PostgreSQL's `CREATE FUNCTION` grants `EXECUTE` to PUBLIC by default and Supabase
adds anon/authenticated — so any new `SECURITY DEFINER` function in `public` is exposed via
`/rest/v1/rpc/<name>` unless you revoke it. Lock down every server-only DEFINER function (see
§4.15) and re-run `get_advisors` after DDL.

---

## 8. Reference notes

### Where passwords are stored
- Passwords live in **`auth.users.encrypted_password`** (schema `auth`, owned by Supabase's
  GoTrue service — **not** in `public`). `public.profiles` links via `profiles.id →
  auth.users.id` and holds **no** credential data.
- Despite the column name, the value is a **bcrypt hash** (one-way + per-user salt), not
  reversible encryption — plaintext is never stored and can't be recovered, only reset.
- Login (`signInWithPassword`) compares hash-vs-hash. **Never read/log/expose**
  `encrypted_password`.

---

## 9. Not yet built / roadmap

> **Updated 2026-06-10.** The payment-submit, admin-payment, and referral-claim routes,
> the `/forgot-password` page, the dashboard/deck-detail migration, and the
> `create_deck_with_cards_and_charge()` atomic RPC are all **now built** — they were stale
> entries here. The single open backend item is **Living Deck (#8)**.
>
> The full catalogue of advertised-but-unbuilt product features (Living Decks, Deep Dive,
> PDF export, the non-signup reward methods, deck/card editing, quiz history, Pro-expiry
> enforcement, account deletion, etc.) now lives in **`docs/MISSING_FEATURES.md`** — that is
> the authoritative feature-gap list.

**Still open — backend**
- **Living Deck** (`src/app/api/quiz/result/route.ts` — `livingDeckRefreshTriggered` wired
  as `false`) — Pro-only; after a quiz with `scorePercent < 70`, call `getWeakCardsForDeck()`,
  send to DeepSeek, insert reinforcement cards, deduct 1 credit. TODO item 8 / `MISSING_FEATURES` B1.

**Still open — data-access / architecture**
- Generated Supabase types — eliminate the `as` casts throughout the data-access layer.
- Integration test suite against a real local Supabase stack (`npm run test:int`).
