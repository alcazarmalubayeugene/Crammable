# Crammable — Backend Status & Setup Log

_Last updated: 2026-05-30_

This document records the current state of the Crammable backend, the database
problem we hit during setup, how it was fixed, and the exact steps used to test
the connection locally.

---

## 1. Project Overview

- **App:** Crammable — turns documents into flashcard decks.
- **My responsibility:** backend only. Frontend is built by another developer.
- **Stack:** Next.js 16.2.6 (App Router), TypeScript, Supabase Auth, PostgreSQL.
- **Source of truth:** `src/lib/contracts.ts` (shared types, routes, limits) and
  `schema.sql` (database). Never hardcode values that live in `contracts.ts`.

---

## 2. Current State — What Is Built & Working

### Authentication system (complete & verified)

| Area | Files | Status |
|---|---|---|
| Supabase clients | `src/lib/supabase/server.ts`, `admin.ts`, `middleware-client.ts` | ✅ |
| Auth helpers | `src/lib/auth/helpers.ts` (`requireAuth`, `requireAdmin`, `getCurrentUser`, `getCurrentProfile`) | ✅ |
| Error handling | `src/lib/auth/errors.ts` (`AuthError` + response builders) | ✅ |
| Route protection | `src/middleware.ts` | ✅ |
| Signup | `src/app/api/auth/signup/route.ts` | ✅ tested |
| Login | `src/app/api/auth/login/route.ts` | ✅ |
| Logout | `src/app/api/auth/logout/route.ts` | ✅ |
| Forgot password | `src/app/api/auth/forgot-password/route.ts` | ✅ |
| Reset password | `src/app/api/auth/reset-password/route.ts` | ✅ |
| OAuth/email callback | `src/app/api/auth/callback/route.ts` | ✅ |

### Database (deployed to Supabase & verified)

- 9 tables: `profiles`, `decks`, `flashcards`, `quiz_sessions`, `quiz_answers`,
  `payment_submissions`, `referral_events`, `rate_limit_log`, `admin_action_log`.
- Row-Level Security enabled on every table with per-user and admin policies.
- Triggers: auto-create profile on signup, `updated_at` maintenance, privilege
  escalation guard, immutable-field guard.
- Functions: `deduct_credit`, `grant_credits`, `check_referral_cap`,
  `check_rate_limit`, `is_current_user_admin`, `generate_unique_referral_code`.
- pg_cron job to clean old rate-limit logs.

### Configuration

- `.env.local` created with live Supabase keys (URL, anon key, service-role key).
- `.env.local` is gitignored — never committed.

### Dependencies added

- `@supabase/ssr` — cookie-based session management for App Router.
- `zod` — request body validation.

---

## 3. What Went Wrong With the Database

Setup was not smooth. Three separate issues were diagnosed and fixed in order.

### Issue A — Wrong Supabase URL format
`.env.local` initially had the URL with a `/rest/v1/` path appended:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co/rest/v1/   ← wrong
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co            ← correct
```
The client needs the base project URL only. Fixed.

### Issue B — Schema applied piecemeal / paste corruption
Pasting the full `schema.sql` into the Supabase SQL Editor kept failing because
SQL was being copied out of the chat window, where rendered text corrupted
keywords (e.g. `SECURITY DEFINER` became `SECURITY DEFINE`) and leaked stray
label text into the SQL.

**Lesson:** always copy SQL from the actual `schema.sql` file in the editor —
never from a chat/terminal window. Eventually the full schema was applied
cleanly (the editor shows `schedule N` as the final result — that is just the
cron job's return value and means success, not an error).

### Issue C — THE MAIN BUG: signup failed with "Database error saving new user"

**Symptom:** every signup returned HTTP 500 with the log line:
```
[auth/signup] Supabase signUp error: Database error saving new user
```

**Root cause:** the `handle_new_user` trigger (which auto-creates a profile row
when a user signs up) runs with `SET search_path = public`. It called
`generate_unique_referral_code()`, which used `gen_random_bytes()` — a function
from the **pgcrypto** extension. On Supabase, pgcrypto lives in the
`extensions` schema, which is **not** on the `public`-only search path that the
trigger forces. Inside the trigger, `gen_random_bytes()` could not be found, so
the trigger threw, and Supabase reported the generic "Database error saving new
user".

**Why it was confusing:** calling
`SELECT public.generate_unique_referral_code();` directly in the SQL Editor
*worked*, because the dashboard's search path includes `extensions`. Only the
trigger context (locked to `public`) failed.

**Fix:** rewrote `generate_unique_referral_code()` to use `gen_random_uuid()`,
a Postgres **core** function (in `pg_catalog`) that is always available
regardless of search path — no extension dependency:
```sql
code := upper(substring(replace(gen_random_uuid()::text, '-', '') FROM 1 FOR 8));
```
Applied via `CREATE OR REPLACE FUNCTION` (the trigger keeps pointing at it).
Both the live database and `schema.sql` were updated.

**General rule going forward:** any function called from a
`SET search_path = public` trigger must not use unqualified functions from the
`extensions` schema.

---

## 4. How We Tested (local)

### Step 1 — Start the dev server
In the project folder:
```
npm run dev
```
Wait for `Ready on http://localhost:3000`. Leave this terminal running.

### Step 2 — Call the signup endpoint
Open a **second** terminal and run:
```
curl -X POST http://localhost:3000/api/auth/signup -H "Content-Type: application/json" -d "{\"email\":\"test@crammable.com\",\"password\":\"password123\"}"
```

### Step 3 — Expected success response
```json
{"success":true,"message":"If this email is not already registered, you will receive a verification link shortly."}
```
The `npm run dev` terminal should show `POST /api/auth/signup 200`.

### Step 4 — Confirm in the database
Supabase Dashboard → **Table Editor** → **profiles** → refresh.
A row for `test@crammable.com` appears automatically, with:
- `token_balance = 3` (free-tier starting credits)
- an 8-character `referral_code`

That single auto-created row proves the whole chain works: env vars →
Supabase connection → schema → `handle_new_user` trigger → defaults.

### Other endpoints (same pattern, change the URL/body)
```
# Login
curl -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"test@crammable.com\",\"password\":\"password123\"}"

# Forgot password
curl -X POST http://localhost:3000/api/auth/forgot-password -H "Content-Type: application/json" -d "{\"email\":\"test@crammable.com\"}"
```

### Useful database checks (Supabase SQL Editor)
```sql
-- List all tables (expect 9 rows)
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;

-- Promote a user to admin (for testing admin routes later)
UPDATE public.profiles SET is_admin = true WHERE email = 'test@crammable.com';
```

### Resetting during testing
- Delete test users: Dashboard → **Authentication** → **Users**.
- Disable email confirmation while developing: Dashboard → **Authentication** →
  **Providers** → **Email** → toggle off "Confirm email" (re-enable for prod).
- Allow the callback redirect: Dashboard → **Authentication** →
  **URL Configuration** → add `http://localhost:3000/api/auth/callback`.

---

## 5. Not Yet Built (next backend phase)

Feature API routes defined in `contracts.ts` but not yet implemented:

- `POST /api/upload` — PDF upload, text extraction, OCR detection
- `POST /api/generate` — AI flashcard generation (DeepSeek) + credit deduction
- `GET /api/decks`, `GET /api/decks/[id]`, deck delete
- `POST /api/quiz/[id]`, `POST /api/quiz/result`
- `POST /api/referral/claim`
- `POST /api/payment/submit`
- `GET /api/admin/payments`, approve, reject

Each will reuse `requireAuth()` / `requireAdmin()` from `src/lib/auth/helpers.ts`
and return the `ApiResponse<T>` shapes defined in `contracts.ts`.
