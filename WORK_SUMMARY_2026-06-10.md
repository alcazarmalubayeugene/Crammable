# Crammable — Work Summary (2026-06-10)

A record of everything done in this session: a full code + security audit, the
fixes for every finding, a live database migration, and an environment-config
fix. Written for the team so anyone can see what changed and what (if anything)
they still need to do.

---

## 0. TL;DR

- Produced two audit documents: **`CODE_AUDIT.txt`** and **`SECURITY_AUDIT.txt`**.
- **Fixed every finding** in code. Verification gate is green:
  - `npm run typecheck` → clean (was **2 errors**)
  - `npm run lint` → clean (was **1 warning**)
  - `npm test` (vitest) → **60/60 passing**, 9 files
- **Applied a database migration** to the live Crammable Supabase project
  (referral atomicity + server-side quiz scoring), verified after apply.
- **Fixed a broken local env file** (`env.local` → `.env.local`) that was
  causing the "Your project's URL and Key are required" crash.

---

## 1. Audits delivered

| File | Contents |
|---|---|
| `CODE_AUDIT.txt` | Correctness bugs, redundant/dead code, optimization, contract/schema drift. Severity-ranked with a quick-win checklist. |
| `SECURITY_AUDIT.txt` | Auth/authz, RLS, referral fraud, CSRF, secrets, injection, data privacy (RA 10173), DoS, headers. Severity-ranked with a remediation list. |

Both were generated from a full read of every route handler, the data-access
layer, the Supabase clients, `schema.sql`, and the client pages.

---

## 2. Code fixes applied

All changes verified together (typecheck + lint + tests green).

### 2.1 Configuration & cleanup
- **`next.config.ts`** — removed duplicate object keys (`turbopack`,
  `serverExternalPackages` were each declared twice). This was the **only** reason
  `tsc` was failing. Dropped the unused `@napi-rs/canvas` external (it's a
  client-side dependency). Added a `headers()` block with security response
  headers: `Content-Security-Policy: frame-ancestors 'none'`, `X-Frame-Options:
  DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `Permissions-Policy`.
- Removed the unused `internalErrorResponse` import in `api/auth/logout/route.ts`
  (the lone lint warning).
- Removed unused helpers `jsonResponse` / `genericInternalError` from
  `src/lib/api/errors.ts`.

### 2.2 Contract drift / hardcoded strings (CLAUDE.md §0)
- Replaced hardcoded `"Crammable"` literals with `App.name` in `dashboard`,
  `login`, and `signup` pages.
- Replaced raw `"/"` with `Routes.home`, raw `from("profiles")` with
  `TableNames.profiles` (admin page), `"/api/auth/signup"` with
  `ApiPaths.authSignup`, and assorted `href="/login"` / `href="/signup"` with
  `Routes.login` / `Routes.signup`.
- Added **`ApiPaths.authSignup`** and **`UIMessages.referralClaimThanks`** to
  `contracts.ts` (source of truth first).
- Quiz result page now **imports** `QUIZ_RESULT_KEY` + `QuizResultData` from the
  quiz page instead of re-declaring them (no more silent drift).

### 2.3 Quiz logic
- **Distractor selection** (`api/quiz/[id]/route.ts`): replaced the biased
  `sort(() => 0.5 - Math.random())` with a proper Fisher–Yates shuffle, and
  pre-bucket cards by category once (was O(n²) per quiz).
- Fixed the `looslyCorrect` → `looselyCorrect` typo.

### 2.4 Upload hardening (`api/upload/route.ts`)
- **Auth, consent, and rate-limit are now ALWAYS enforced** (outside the dev-only
  test mode). Previously the whole gate was conditional on the service-role env
  being present, so a missing key turned upload into an open, unauthenticated
  PDF-parsing endpoint. The env now only affects the optional tier lookups.
- Added a `Content-Length` pre-check that rejects oversized bodies **before**
  buffering the multipart payload into memory.

### 2.5 CSRF protection
- New helper **`src/lib/api/csrf.ts`** (`assertSameOrigin`) — rejects browser
  requests whose `Origin`/`Referer` host doesn't match the request host.
- Applied to all state-changing routes: `upload`, `generate`, `payment/submit`,
  `quiz/[id]`, `quiz/result`, `admin/payments/approve`,
  `admin/payments/reject`, `referral/claim`.

### 2.6 Referral attribution — made atomic + single-source
This was the highest-value fraud fix. Previously **two** non-transactional code
paths (the `/api/referral/claim` form and `auth/callback` auto-processing) each
did check → grant → log → set-`referred_by` as separate steps, which could
double-award credits.

- New DB function **`claim_referral()`** folds the whole attribution into one
  transaction: lock the referred profile row → re-check `referred_by`/self/cap →
  insert ledger → `grant_credits` → set `referred_by`.
- New partial unique index **`ux_referral_signup_once_per_referred`** as a hard
  DB backstop against duplicate signup awards.
- **Both** referral paths now call the single `claimReferral()` wrapper
  (`src/lib/db/rpc.ts`) — the duplicated logic is gone.
- Fixed the misleading success toast: the referrer (not the claimer) is credited,
  so `/rewards` now shows `UIMessages.referralClaimThanks`.
- Added typed error mappings in `toDbError` for `SELF_REFERRAL`,
  `ALREADY_REFERRED`, `REFERRAL_CAP_REACHED`, and the duplicate-index violation.

### 2.7 Quiz scoring — server-side re-derivation
- **`submit_quiz_result()`** now re-derives each answer's correctness from the
  canonical `flashcards.back` (case-insensitive, trimmed) instead of trusting the
  client's `isCorrect` flag. A client can no longer POST a fake 100% or corrupt
  card difficulty. RLS confines the grading join to the caller's own cards.

### 2.8 Dead-code removal
Removed 7 unused, untested data-access helpers (and their barrel exports):
`updateDeckCardCount`, `getQuizSessionById`, `getPaymentById`,
`listUserPayments`, `getProfileById`, `setReferredBy`, `logReferralEvent`.

### 2.9 Misc
- `truncateToMaxInputTokens` now trims back to the last whitespace boundary
  instead of cutting mid-word before the DeepSeek call.

### New files created
- `CODE_AUDIT.txt`
- `SECURITY_AUDIT.txt`
- `src/lib/api/csrf.ts`
- `WORK_SUMMARY_2026-06-10.md` (this file)

---

## 3. Database migration (applied to the live project)

> The repo's `schema.sql` was updated to match, so the canonical file and the
> live database are in sync.

### Choosing the right project (important)
The Supabase MCP connection was initially pointed at the **wrong account** — the
only reachable project was an unrelated **"NEWS APP"** (with ~37k rows of real
news data). We **did not** touch it. The MCP connection was re-authenticated to
the correct account/org, after which the **`Crammable`** project appeared and was
verified by matching its tables (`profiles`, `decks`, `flashcards`, …) before any
write.

- **Target:** `Crammable` · project ref `gjrdlmxlqngqcnflygcp` · org **E.M.A** ·
  region `ap-southeast-2`.

### Migration: `audit_referral_atomicity_and_quiz_scoring`
Applied as one atomic transaction. **No row data was modified, deleted, or
migrated** — only schema objects:
1. `CREATE UNIQUE INDEX ux_referral_signup_once_per_referred` (referral backstop).
2. `CREATE OR REPLACE FUNCTION claim_referral(...)` + `REVOKE`/`GRANT` so only
   `service_role` can execute it.
3. `CREATE OR REPLACE FUNCTION submit_quiz_result(...)` (server-side scoring).

### Pre-checks (read-only, before applying)
- No duplicate `signup` referral rows → the unique index could build cleanly.
- `claim_referral` did not yet exist; `submit_quiz_result` existed and was replaced.

### Post-apply verification
- `claim_referral` exists ✓ and `submit_quiz_result` replaced ✓
- `ux_referral_signup_once_per_referred` built ✓
- `claim_referral` EXECUTE: `service_role` = yes, `authenticated`/`anon` = **no** ✓
- Security advisor showed **no new issues** from the migration (both new
  functions set `search_path` and `claim_referral` is locked down).

---

## 4. Environment config fix (`.env.local`)

**Symptom:** runtime crash — *"Your project's URL and Key are required to create
a Supabase client!"* thrown from `proxy.ts` → `createMiddlewareClient`.

**Root cause:** the env file was named **`env.local`** (missing the leading dot).
Next.js only loads **`.env.local`**, so the file was ignored and all
`NEXT_PUBLIC_SUPABASE_*` vars were `undefined`. (Common Windows Explorer gotcha.)

**What was done:**
- Renamed `env.local` → `.env.local`.
- Confirmed `.env.local` is **gitignored**.
- Confirmed the old `env.local` was **never tracked in git** → **no secret leak**,
  no key rotation needed.
- All six expected variables were present and non-empty; only the filename was wrong.

**Canonical values for verification** (URL + anon key are public; the
service-role key must come from Dashboard → Settings → API):
- `NEXT_PUBLIC_SUPABASE_URL` = `https://gjrdlmxlqngqcnflygcp.supabase.co`
- `NEXT_PUBLIC_APP_URL` = `http://localhost:3000` (local dev)
- `SUPABASE_SERVICE_ROLE_KEY` = the **service_role** secret (not the anon key)
- `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` = e.g. `deepseek-chat`

**ACTION STILL NEEDED:** restart the dev server (`npm run dev`) — env files are
only read at startup, so the running server must be restarted to pick up the
renamed file.

---

## 5. Subscription / Pro flow (reviewed, informational)

We traced how a user becomes Pro. Current live state: **1 admin, 0 Pro users, 5
free users, 0 payments submitted** (the path has never been exercised).

**How it works:**
1. User GCash-pays ₱150 and submits the 13-digit reference on `/upgrade` →
   `POST /api/payment/submit` → a `payment_submissions` row with `status =
   'pending'`. The user stays **free** at this point.
2. An admin verifies the payment in their GCash app, then clicks **Approve** on
   `/admin` → `approve_payment()` runs atomically: marks the payment `verified`,
   flips `subscription_tier` → `'pro'`, sets `subscription_expires_at` to +30 days
   (renewals stack), grants **+30 credits**, and writes an `admin_action_log` row.
3. The user is now Pro. Only this admin-approval path can flip the tier (a DB
   trigger blocks any client-side tier change).

**Two gaps noted (not yet fixed):**
- **`App.gcashNumber` is blank** in `contracts.ts`, so the `/upgrade` page can't
  show a number to pay to — it tells users to email support instead. Real
  payments can't flow until this is filled in.
- **Pro never expires in practice.** `subscription_expires_at` is set but nothing
  downgrades a lapsed Pro back to `free`, and feature gates check
  `subscription_tier`, not the expiry date. Subscriptions effectively don't end
  until an admin changes the tier manually.

---

## 6. Verification summary

| Check | Before | After |
|---|---|---|
| `npm run typecheck` | 2 errors | clean |
| `npm run lint` | 1 warning | clean |
| `npm test` (vitest) | 60 pass | 60 pass |
| DB migration | n/a | applied + verified |

> Note: the vitest suite uses a mocked Supabase client, so it covers the
> TypeScript/data-access logic but not the live Postgres functions
> (`claim_referral`, `submit_quiz_result`) — those were verified directly against
> the database after the migration.

---

## 7. Outstanding actions for the team

1. **Restart the dev server** so the renamed `.env.local` is loaded.
2. **Fill in `App.gcashNumber`** in `contracts.ts` before accepting real payments.
3. **Decide on Pro expiry enforcement** (currently Pro doesn't lapse) — design
   choice, not yet implemented.
4. Deploy the updated application code (the live DB already has the matching
   functions, so code and schema are aligned).
