# FRONTEND.md — Crammable Frontend

**Developer:** Eugene Ibanez (AmIDestinedforGreatness)
**Branch:** FrontEnd
**Stack:** Next.js 16 (App Router), Tailwind CSS v4, Supabase JS v2
**Design system:** Capybara palette — see color tokens below

---

## Pages & Routes

| Route | File | Status | Description |
|---|---|---|---|
| `/` | `src/app/page.tsx` | ✅ Done | Landing page — hero, features, pricing |
| `/login` | `src/app/login/page.tsx` | ✅ Done | Login form — wired to Supabase auth |
| `/signup` | `src/app/signup/page.tsx` | ✅ Done | Signup form — wired to Supabase auth |
| `/forgot-password` | `src/app/forgot-password/page.tsx` | ✅ Done | Email form → triggers password reset email. Enumeration-safe, 60s resend cooldown, authed-user guard. |
| `/settings?mode=reset-password` | `src/app/settings/page.tsx` | ✅ Done | Detects `?mode=reset-password`, renders new-password form (confirm field + show/hide), handles success/expired-link/validation cases. |
| `/dashboard` | `src/app/dashboard/page.tsx` | ✅ Done | User dashboard — credits, plan, deck list |
| `/decks/new` | `src/app/decks/new/page.tsx` | ✅ Done | PDF upload → AI generation flow (PdfUploadFlow); Deep Dive (Pro) toggle |
| `/decks/[id]` | `src/app/decks/[id]/page.tsx` | ✅ Done | Deck detail — flip-card viewer; **rename deck**, **add/edit/delete card**, **share + copy public link**, **export PDF (Pro)**, **study-weak-cards mode**, **quiz history**, quiz CTA. ⚠️ no **delete-deck** control yet (endpoint exists) |
| `/public/decks/[id]` | `src/app/public/decks/[id]/page.tsx` | ✅ Done | Read-only public deck viewer (no auth, no edit/quiz) |
| `/quiz/[deckId]` | `src/app/quiz/[deckId]/page.tsx` | ✅ Done | Quiz session — MC / Identification / Mixed |
| `/quiz/[deckId]/result` | `src/app/quiz/[deckId]/result/page.tsx` | ✅ Done | Score, missed-card review, **Living Deck reinforcement notice / Pro upsell**, retry/back |
| `/upgrade` | `src/app/upgrade/page.tsx` | ✅ Done | GCash manual payment — 13-digit ref number form |
| `/rewards` | `src/app/rewards/page.tsx` | ✅ Done | Referral code, **all 4 earn methods** (signup, share-a-deck, write-a-review, complete-profile), claim code, history |
| `/settings` | `src/app/settings/page.tsx` | ✅ Done | Edit name/course (+ **profile-complete reward**), change password, **export my data**, **delete account**, sign out |
| `/admin` | `src/app/admin/page.tsx` | ✅ Done | Admin-only — approve/reject payments, **verify app reviews**, **user list + grant credits**, **audit log**. ⚠️ reachable only by URL (no nav link) |

> **Global chrome gaps** (see `docs/BASIC_UI.md`): no `not-found.tsx` / `error.tsx` /
> `loading.tsx`, no shared `<Navbar>`/`<Footer>` (re-implemented per page), no admin
> nav link.

---

## API Routes the Frontend Calls

All paths come from `ApiPaths` in `contracts.ts`. The frontend calls these via
`fetch()`. **As of 2026-06-11 every endpoint the UI calls is implemented** and every
page has been migrated off direct Supabase reads (the dashboard/deck-detail pages now
use the API; only the dashboard's own-profile read stays a direct RLS-scoped query, by
design, since there is no profile route).

| Endpoint | Method | Used by page | Backend status |
|---|---|---|---|
| `/api/auth/forgot-password` · `/reset-password` · `/resend-confirmation` | POST | auth pages | ✅ |
| `/api/upload` · `/api/generate` | POST | `/decks/new` | ✅ (generate: atomic deck-create + credit charge; Deep Dive mode) |
| `/api/decks` | GET | `/dashboard` | ✅ |
| `/api/decks/[id]` | GET / PATCH (rename) / DELETE | `/decks/[id]` | ✅ (GET+PATCH wired in UI; **DELETE has no UI button yet**) |
| `/api/decks/[id]/flashcards` | POST | `/decks/[id]` | ✅ add card |
| `/api/flashcards/[id]` | PATCH / DELETE | `/decks/[id]` | ✅ edit / delete card |
| `/api/decks/[id]/share` | POST / DELETE | `/decks/[id]` | ✅ share / unshare (+ deck_share reward) |
| `/api/decks/[id]/export` | GET | `/decks/[id]` | ✅ PDF export (Pro-gated) |
| `/api/public/decks/[id]` | GET | `/public/decks/[id]` | ✅ unauthenticated read-only |
| `/api/quiz/[id]` · `/api/quiz/result` | POST | `/quiz/[deckId]` | ✅ (server builds questions; atomic + idempotent submit; Living Deck) |
| `/api/quiz/history` | GET | `/decks/[id]` | ✅ per-deck history |
| `/api/referral/claim` | POST | `/rewards` | ✅ |
| `/api/rewards/submit-review` | POST | `/rewards` | ✅ write-a-review earn |
| `/api/rewards/claim-profile-complete` | POST | `/settings` | ✅ profile-complete earn |
| `/api/payment/submit` | POST | `/upgrade` | ✅ |
| `/api/account/export` · `/api/account/delete` | GET / POST | `/settings` | ✅ data export / account deletion |
| `/api/admin/payments` (+ `/approve`, `/reject`) | GET / POST | `/admin` | ✅ |
| `/api/admin/reviews` (+ `/verify`) | GET / POST | `/admin` | ✅ app-review verification |
| `/api/admin/users` (+ `/grant-credits`) | GET / POST | `/admin` | ✅ user list + credit grants |
| `/api/admin/audit-log` | GET | `/admin` | ✅ audit trail |

> Payment approve/reject also surface to the student live via a Supabase Realtime
> subscription on `payment_submissions` (`src/app/PaymentNotifications.tsx`, mounted in
> the root layout) — no page reload needed.

---

## Frontend spec — forgot-password & reset-password flow

> **✅ Both UI pieces are now built** (`/forgot-password` page and the
> `/settings?mode=reset-password` handler — see the Pages table above). The spec below
> is retained as a reference for how the flow is wired.

### Full flow (so you understand what you're wiring up)

```
User clicks "Forgot password?" on /login
        ↓
/forgot-password   — user enters email → POST /api/auth/forgot-password
        ↓
Supabase sends a reset email with a link → /api/auth/callback?type=recovery
        ↓
Callback exchanges the token for a session, then redirects to:
  /settings?mode=reset-password
        ↓
Settings page detects ?mode=reset-password → shows password form
User enters new password → POST /api/auth/reset-password
        ↓
On success → redirect to /dashboard (password changed, they're logged in)
```

---

### Piece 1 — `/forgot-password` page

**File to create:** `src/app/forgot-password/page.tsx`

This is a simple one-field form. Mirror the styling of `/login` exactly — same card,
same navbar, same font/colour tokens.

#### What to build

- Navbar identical to `/login` (logo left, "Back to login" link right linking to `Routes.login`)
- Centred card with:
  - Capybara 🦫 emoji + heading "Forgot your password?" + subheading "Enter your email and we'll send a reset link."
  - Email input (same `inputStyle` as login/signup)
  - Submit button "Send reset link" → "Sending…" while loading
  - After success: hide the form entirely, show a confirmation message instead (see below)

#### API call

```ts
import { ApiPaths } from "@/lib/contracts";

const res = await fetch(ApiPaths.authForgotPassword, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email }),
});
const data = await res.json();
```

**The route always returns `{ success: true, message: "..." }` — for both registered and
unregistered emails.** This is intentional (enumeration-safe). Never show an error for
this endpoint unless it's a network failure or the email field is blank/invalid.

#### Success state (replace the form with this)

After a successful POST (or any non-network response), hide the form and show:

```
🦫
Check your inbox
We've sent a password reset link to [email] if an account exists.
Didn't get it? Check spam, or [resend it] (click triggers the same POST again).
[← Back to login]  (link to Routes.login)
```

Use `data.message` from the response as the body copy, or use the text above verbatim —
both are fine since the route always returns the same safe string.

#### Guard

The page should redirect authenticated users to `Routes.dashboard` (same logic as `/login`).
Check with `getSupabaseBrowserClient().auth.getUser()` on mount — if user exists, redirect.

---

### Piece 2 — `/settings?mode=reset-password`

**File to update:** `src/app/settings/page.tsx` (don't create a new file)

When the URL has `?mode=reset-password`, the settings page should render a
password-reset form **instead of** (or overlaid over) the normal settings content.
The user is already logged in at this point — the callback established the session.

#### Detection

```ts
"use client";
import { useSearchParams } from "next/navigation";

const searchParams = useSearchParams();
const isResetMode  = searchParams.get("mode") === "reset-password";
```

#### What to show in reset mode

Replace the normal page content with a centred card (same style as login):

- Heading: "Set a new password"
- Subheading: "You're almost in. Choose a new password for your account."
- Single input: "New password" (type="password", placeholder "••••••••", min 8 chars)
- Submit button: "Update password" → "Updating…" while loading
- On success: show "Password updated! Redirecting…" then `window.location.replace(Routes.dashboard)`
- On error: show `data.error.message` in the same error-box style used on `/login`

#### API call

```ts
import { ApiPaths } from "@/lib/contracts";

const res = await fetch(ApiPaths.authResetPassword, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ newPassword }),
});
const data = await res.json();
```

#### Possible responses

| Scenario | `data.success` | `data.error.code` | What to show |
|---|---|---|---|
| Password updated | `true` | — | "Password updated! Redirecting…" → redirect to dashboard |
| Same as old password | `false` | `VALIDATION_ERROR` | `data.error.message` ("New password must be different…") |
| Session expired | `false` | `UNAUTHORIZED` | "Your reset link has expired. [Request a new one]" → link to `/forgot-password` |
| Other error | `false` | `INTERNAL_ERROR` | "Something went wrong. Please try again." |

#### Edge case — link already used or expired

If the user opens an old reset link (or the tab was open too long), the callback
will have redirected them to `/settings?mode=reset-password` but the session won't
have the reset scope. The POST to `/api/auth/reset-password` will return a 401
(`UNAUTHORIZED`). Handle it as shown in the table above — show a "link expired" message
with a link back to `/forgot-password`.

---

### Contracts reference (do not hardcode these strings)

```ts
import { ApiPaths, Routes } from "@/lib/contracts";

ApiPaths.authForgotPassword  // "/api/auth/forgot-password"
ApiPaths.authResetPassword   // "/api/auth/reset-password"
Routes.forgotPassword        // "/forgot-password"
Routes.login                 // "/login"
Routes.dashboard             // "/dashboard"
Routes.settings              // "/settings"
```

---

## Auth Proxy (Next.js 16)

Next.js 16 renamed `middleware.ts` → `proxy.ts`. The file lives at `src/proxy.ts`
and exports a `proxy` function (not `middleware`). It handles three things:

1. **Redirect unauthenticated users** away from protected routes → `/login`
2. **Redirect authenticated users** away from `/login` and `/signup` → `/dashboard`
3. **Block non-admins** from `/admin` → `/dashboard`

The session cookie refresh (required by `@supabase/ssr`) also happens here via
`createMiddlewareClient` in `src/lib/supabase/middleware-client.ts`.

> ⚠️ **Do not rename this file back to `middleware.ts`.** Having both files at once
> causes double cookie writes that break login session persistence.

---

## Supabase Client

The frontend uses `getSupabaseBrowserClient()` from `@/lib/supabase/browser`.

```ts
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
const supabase = getSupabaseBrowserClient();
```

Never use the service-role key on the frontend. Never import from `@/lib/supabase/server` or `@/lib/supabase/admin` in client components.

---

## Color Tokens (Capybara Palette)

| Token | Hex | Usage |
|---|---|---|
| Espresso | `#2E1A0C` | Navbar background, primary text |
| Mahogany | `#4A2512` | Active nav, pro tip card |
| Amber | `#C47A2E` | Primary buttons, CTAs, links |
| Gold | `#D4954A` | Icon highlights |
| Sand | `#C49A6C` | Navbar secondary text |
| Parchment | `#FAF2E4` | Page background |
| Cream | `#FFFCF7` | Card backgrounds |
| Border | `#E0C9A8` | All borders |
| Muted | `#8A6E52` | Secondary text |
| Moss | `#5C7A35` | Success / checkmarks |

Fonts: **Lora** (headings) + **DM Sans** (body) — loaded via `next/font/google` in `layout.tsx`.

---

## New PC Setup

```bash
git clone https://github.com/alcazarmalubayeugene/Crammable.git crammable
cd crammable
git checkout FrontEnd
npm install
```

Create `.env.local` in the project root (this file is gitignored — every machine needs its own copy):

```
NEXT_PUBLIC_SUPABASE_URL=https://gjrdlmxlqngqcnflygcp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_dGN7NMHRmhnu9GfT25Jdhw_z6N2yPGD
SUPABASE_URL=https://gjrdlmxlqngqcnflygcp.supabase.co
```

> **Missing `.env.local` = login won't work.** The file is never committed to git,
> so every new machine must create it manually before running the app.

Then run: `npm run dev`

---

## Bug Fix Documentation Rule

Whenever a bug is fixed, it **must** be documented here with three things:
1. **What broke** — what the symptom was
2. **Why it happened** — the root cause
3. **What to watch out for** — so teammates don't cause the same bug again

### Known fixes so far

---

#### Registration appeared broken — generic "Something went wrong" + dropped fields
- **What broke:** Signing up showed a generic *"Something went wrong. Please try again or contact support."* with no reason. Separately, the required **Course/Program** field, the **consent** checkbox, and the **full name** were not being saved to the user's profile.
- **Why:** Several causes in the signup flow.
  1. **Errors masked.** `/api/auth/signup` returned `INTERNAL_ERROR` (500) for *every* Supabase error except "already registered". So user-fixable rejections — invalid email (Supabase rejects `@example.com`, `@test.com`, etc.), weak password, mail rate limits — all surfaced as the same useless generic message. Confirmed via live probe: a Supabase "Email address is invalid" came back to the user as a 500.
  2. **`course` dropped.** The signup form required Course/Program but never included it in the POST body; the API schema didn't accept it either.
  3. **Consent never stored.** The checkbox was sent as `consentDeeseek` (typo) and the API destructured only `email/password/fullName/referralCode` — consent was parsed-then-ignored, so `consent_deepseek` stayed `false`. This silently blocks uploads later with `CONSENT_REQUIRED`.
  4. **Metadata ignored by trigger.** `signUp` passed `full_name` (and now `course`, `consent_deepseek`) into `auth.users.raw_user_meta_data`, but `handle_new_user()` never read it, so the profile row was created blank.
- **Resolution:** `/api/auth/signup` now maps Supabase errors to actionable codes (`VALIDATION_ERROR` for bad email/weak password/signups-disabled, `RATE_LIMITED` for mail/throttle limits) while keeping the enumeration-safe success for already-registered. Frontend now sends `course` and the correctly-spelled `consentDeepseek`; the API forwards `full_name`, `course`, `consent_deepseek` as signup metadata; and `handle_new_user()` reads them into the profile. **DB step required:** re-apply the updated `handle_new_user()` from `schema.sql` to Supabase (SQL editor) — editing `schema.sql` alone does not change the live database.
- **Watch out for:** Never collapse all Supabase auth errors into `INTERNAL_ERROR` — distinguish user-fixable ones, but keep "already registered" masked to prevent account enumeration. Supabase rejects reserved test domains (`example.com`, `test.com`) — test signups with a real email. The `handle_new_user()` trigger is the *only* place profiles are provisioned; if you add a signup field, thread it through the form → API metadata → trigger, and re-apply the function to the live DB.

---

#### Users stuck on an unconfirmed account; orphaned profiles
- **What broke:** A user who signed up but never confirmed their email got trapped — re-signing up sent no new email and logging in failed, with no way out except an admin deleting the account by hand. Separately, an auth user could exist with **no `profiles` row** (orphan), so even a valid login landed a user with no profile (and the Table Editor showed nothing for them).
- **Why:** Two Supabase behaviours plus a data gap.
  1. **Repeated-signup no-op.** When an email already exists, Supabase returns `user_repeated_signup` (HTTP 200) and sends **no** email — anti-enumeration by design. So a stuck, unconfirmed user can never re-trigger the confirmation by signing up again.
  2. **No resend path.** There was no "resend confirmation" affordance, and the `handle_new_user()` trigger only fires on *new* inserts — it can't retroactively create a missing profile.
  3. **Orphaned profile.** A profile deleted during ops/testing leaves the `auth.users` row with no matching `profiles` row, and nothing re-creates it.
- **Resolution:** Added a self-serve **resend** flow — `POST /api/auth/resend-confirmation` (enumeration-safe, mirrors `forgot-password`, calls `supabase.auth.resend({ type: "signup" })`) with a "Resend confirmation email" button on the signup success screen. Added **self-healing profiles** — a SECURITY DEFINER `ensure_profile(uuid)` RPC (mirrors `handle_new_user` defaults, `ON CONFLICT (id) DO NOTHING`) that the login route calls when the profile fetch returns null, then re-fetches. Both `ensure_profile` and the metadata-aware `handle_new_user` are applied to the live DB via Supabase migrations. Admin rescue steps documented in `docs/PROJECT-DOCUMENTATION.md` (§6 Auth operations runbook).
- **Watch out for:** Keep resend/login enumeration-safe — never reveal whether an email exists or its confirmation state. `ensure_profile` must stay in lockstep with `handle_new_user` (same columns/defaults); if you change one, change both and re-apply to the live DB. Deleting an account is the *last* resort — try resend → manual confirm → backfill first (see the runbook). Deferred follow-ups are tracked in `docs/TODO.md`.

---

#### `npm run dev` ate ~8 GB RAM and lagged; `next.config.ts` was silently ignored
- **What broke:** `npm run dev` spiked memory to ~8 GB on startup and lagged the machine. Separately, none of the settings in `next.config.ts` were taking effect.
- **Why:** Two compounding causes.
  1. **Duplicate config file.** Both `next.config.mjs` (empty) and `next.config.ts` existed. Next.js resolves config in the fixed order `[next.config.js, next.config.mjs, next.config.ts]` and loads the **first** one it finds, so the empty `.mjs` won and `.ts` was never read — every setting in it was a dead no-op.
  2. **Wrong workspace root.** A stray `package-lock.json` sat in the **parent** folder (`WITH FRONT END LOGIN + BASIC/`) alongside the project's own lockfile. Next inferred the parent directory as the workspace root, so Turbopack's module resolution and file watcher were scoped to that entire parent tree instead of just the project — wasted memory and watch overhead. On boot Next also preloads every route's modules into memory by default, inflating the startup spike.
- **Resolution:** Deleted `next.config.mjs` so the typed `next.config.ts` actually loads, and set it to: `turbopack.root = <project dir>` (pins the workspace root), `serverExternalPackages: ["pdfjs-dist"]` (keeps the server-side PDF lib out of the bundle), and `experimental.preloadEntriesOnStart: false` (skips preloading all routes at boot). If memory still spikes, cap the heap: `$env:NODE_OPTIONS="--max-old-space-size=4096"; npm run dev`.
- **Watch out for:** Never keep two `next.config.*` files at once — `.mjs`/`.js` will shadow `.ts` and your config changes will silently do nothing. Turbopack is already the default bundler in Next 16 (no `--turbopack` flag needed); don't add Webpack-only memory flags. If you see the *"Next.js inferred your workspace root… multiple lockfiles"* warning, fix `turbopack.root` (or remove the stray lockfile) — a wrong root widens file watching and memory. This was **not** a Vite problem; this app is Next.js and cannot run on Vite without a rewrite.

---

#### Quiz result page clears on refresh *(deferred — building/testing phase)*
- **What broke:** Refreshing `/quiz/[deckId]/result` shows "No quiz results found" because results are stored only in `sessionStorage`, which browser clears on refresh.
- **Why:** The backend `/api/quiz/result` route is not yet implemented. Results are held client-side as a temporary workaround.
- **Resolution:** When Mallubay/Alcazar implement `/api/quiz/result`, the quiz page will POST answers to the DB before redirecting. The result page will then read from the DB, not `sessionStorage`.
- **Watch out for:** Do not ship this to production until quiz results are persisted server-side.

---

#### Quiz scores can be tampered via DevTools *(deferred — building/testing phase)*
- **What broke:** A user could open DevTools, edit `sessionStorage`, and fake a perfect score on the result page.
- **Why:** Same root cause as above — scores are computed client-side and passed via `sessionStorage` because the backend quiz routes aren't ready yet.
- **Resolution:** Backend must re-compute and validate scores server-side. Never trust client-submitted `isCorrect` flags.
- **Watch out for:** If the backend routes accept a pre-computed score from the frontend without re-validating, this becomes a real exploit.

---

#### Login not working on new machines
- **What broke:** Users couldn't log in; session didn't persist after signing in.
- **Why:** `.env.local` was missing on the new machine (it's gitignored and never committed), so Supabase had no URL or keys to connect to.
- **Watch out for:** Every new machine or fresh clone needs its own `.env.local` created manually. See the New PC Setup section.

---

#### Signup consent + course + full name silently discarded
- **What broke:** Users signing up had `consent_deepseek = false` permanently in the DB. `full_name` and `course` filled in at signup were also never saved to the profile. Uploading a PDF would always return `CONSENT_REQUIRED`.
- **Why:** Three separate issues: (1) typo `consentDeeseek` in `page.tsx` and `signup/route.ts` (missing `p`); (2) `consentDeepseek` was validated by Zod but never destructured or used in the route handler; (3) `course` was collected on the form but never sent to the API. The `handle_new_user()` DB trigger always inserts `consent_deepseek = false` and doesn't write `full_name` or `course` at all.
- **Fix:** Typo corrected everywhere. `course` added to the signup schema. All three fields (`full_name`, `course`, `consent_deepseek`) now stored in Supabase auth `user_metadata` at signup, then written to the profile by the callback route (`/api/auth/callback`) after email verification using the admin client.
- **Watch out for:** The DB trigger still defaults `consent_deepseek = false` — the correct value only lands after the email verification callback runs. Never read `consent_deepseek` from the profile before a user has verified their email or the gate will always fail. Teammates have been notified to update the trigger.

---

#### Login broken after Next.js 16 upgrade (`middleware.ts` → `proxy.ts`)
- **What broke:** Session cookies weren't being refreshed properly, causing logged-in users to get redirected back to `/login`.
- **Why:** Next.js 16 deprecated `middleware.ts` and renamed it to `proxy.ts` with a new export name (`proxy` instead of `middleware`). Having both files at once caused double cookie writes that cancelled each other out.
- **Watch out for:** Never rename `proxy.ts` back to `middleware.ts`. Never have both files exist at the same time. If you see the warning _"The middleware file convention is deprecated"_, the fix is to rename and re-export correctly.

---

## Notes for Teammates

- **Quiz questions** are currently generated client-side from the deck's flashcards.
  When `/api/quiz/[id]` is ready, replace the `buildQuestions()` call in
  `src/app/quiz/[deckId]/page.tsx` with a `fetch(ApiPaths.startQuiz(deckId))`.
- **Quiz results** are passed to the result page via `sessionStorage` (key: `crammable_quiz_result`).
  When `/api/quiz/result` is ready, add the submit call before the redirect in `nextQuestion()`.
- **Deck + flashcard reads** on `/decks/[id]` and `/quiz/[deckId]` query Supabase directly.
  RLS ensures users only see their own data. These are safe as-is until the API routes exist.
- **Auth headers** — all `fetch()` calls to protected routes use `authHeaders()` from
  `src/lib/api/auth-headers.ts`, which attaches `Authorization: Bearer <token>`.

---

## Versioning

The app displays a version badge on every page (bottom-left corner).
The version lives in `App.version` inside `src/lib/contracts.ts` — update it there and it
changes everywhere automatically.

**Rules:**
- Start: `v.01`
- Bump by `+0.1` **once per working session** (not per individual fix or change) → `v.02`, `v.03`, …
- At the end of each session: update `App.version` in `contracts.ts` **and** add one row to the Version History table below.

---

## Version History

| Version | What changed |
|---|---|
| v.01 | Initial frontend — landing, login, signup, dashboard, all app pages, proxy auth fix, version badge |
| v.02 | Security hardening — user_id double-filter on Supabase queries, load timeouts, login redirect fix, referral input sanitization, sign-out confirmation, dashboard deck shortcut |
| v.02 (cont.) | Bug fix — signup consent/course/full_name now correctly saved to profile via callback; version badge moved to bottom-right |
| v.03 | DeepSeek flashcard generation live (frontend) — merged prompt/AI-Gen branch, added openai package, full generate route (auth + Supabase persistence + credit deduction), PdfUploadFlow wired to callGenerate, PDF_EXTRACTION_TEST_MODE off, version badge moved to bottom-right. Backend — registration fixes (error mapping, course/consent/name persistence via metadata-aware `handle_new_user` trigger) + stuck-confirmation recovery (self-serve resend-confirmation, self-healing profiles on login, admin auth runbook) |
| v.04 | Merged Christian's `main` backend push (deck/auth fixes + atomic Supabase RPCs) into `FrontEnd`, AI-consent gate (signup persistence + upload checkbox screen). New: `/forgot-password` page + `/settings?mode=reset-password` flow (full spec implementation — enumeration-safe, cooldown, expired-link handling). Migrated `/dashboard` and `/decks/[id]` off direct Supabase reads onto `GET /api/decks` and `GET /api/decks/[id]` (#6b). Dashboard navbar brought in line with the master doc — added Rewards/Settings links, "Earn more →" / "Upgrade →" contextual CTAs, credits pill kept as a non-clickable status display (not a link, per §19/§9.1). Plus 6 small lint/cleanup fixes (`<a>` → `<Link>`, unescaped apostrophes, dead `shareUrl` var, lazy-init refactor on quiz-result to drop a cascading-render warning). All typecheck + lint clean. |
| v.05 | Merged latest `main` (referral/claim route + schema.sql update). Fixed duplicate `App` import in `layout.tsx` (introduced by merge conflict). Removed erroneous `"extends": "expo/tsconfig.base"` from `tsconfig.json`. Added referred-by entry to `/rewards` History section — if `profile.referred_by` is set, fetches referrer's `full_name` and shows "Referred by [name] · +10 credits" row. |
| v.06 | **Merged `main`'s feature-completion push (B/C/D/E) + security hardening.** Deck-detail rebuilt — rename, add/edit/delete card, share + copy public link, PDF export (Pro), study-weak-cards mode, per-deck quiz history (kept FrontEnd's existing delete-deck button, ported onto main's rebuilt page). Deep Dive (Pro) toggle in upload flow; Living Deck reinforcement notice / upsell on quiz result; public read-only deck viewer (`/public/decks/[id]`). Rewards page gained all 4 earn methods (share-a-deck, write-a-review, complete-profile — kept FrontEnd's "Referred by [name]" history entry alongside them); settings gained data export + account deletion; admin gained review verification, user list + grant credits, and audit log. Backend: `app_reviews` table + new atomic RPCs (Living Deck, self-referral earns, review verify, account deletion), Pro-expiry cron, payment Realtime. Security audit: closed a public-deck IDOR (owner-scoped deck lookups), CSRF/JSON/rate-limit gaps on new routes, trimmed public projection, pinned function `search_path`. Full schema applied live; typecheck + lint + 75 tests green. |

---

## For Claude (Session Lifeline)

> **Current status (2026-06-12):** `main`'s full feature-completion push (B/C/D/E +
> security hardening) has been merged into `FrontEnd`. Every page and every backend
> route the UI calls is built and wired — `/upgrade`, `/admin`, `/rewards`, Living Deck
> UI, deck/card editing, share, export, history, account export/delete, and the
> delete-deck button (FrontEnd already had this; kept it through the merge onto main's
> rebuilt `/decks/[id]` page). The remaining gaps are app-wide chrome only — see Pending
> below. The dated log below is historical.

**Last session: 2026-06-12**

### What happened
- Merged `origin/main` (`82547d4`, feature-completion B/C/D/E + security hardening, 60 files / +6598/-273) into `FrontEnd`
- Resolved conflicts on `FRONTEND.md`, `src/app/decks/[id]/page.tsx`, `src/app/rewards/page.tsx` — took main's rebuilt pages, kept FrontEnd's delete-deck button and "Referred by [name]" rewards history entry
- `App.version` bumped `v.05` → `v.06`

**Last session (historical): 2026-06-07**

### What happened
- Pulled latest `FrontEnd` from remote (was 2 versions behind on Mom’s PC)
- Merged `origin/main` — brought in `src/app/api/referral/claim/route.ts`, updated `schema.sql`, one addition to `contracts.ts`
- Fixed duplicate `App` import in `layout.tsx` (introduced by the merge)
- Removed `"extends": "expo/tsconfig.base"` from `tsconfig.json` — wrong config for a Next.js project, would break builds
- Resolved merge conflicts on `FRONTEND.md`, `signup/route.ts`, `signup/page.tsx` — remote won on all code
- Added referred-by history entry to `/rewards`: if `profile.referred_by !== null`, fetches referrer’s `full_name` from profiles and renders "Referred by [name] · +10 credits" at the bottom of the History list. Falls back to "a classmate" if name is not set.
- `App.version` bumped `v.04` → `v.05`

### Bug found (backend fix needed — tell Christian)
- Referral claim route (`/api/referral/claim`) requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. If missing, it crashes at `checkRateLimit` with a generic 500 before any referral logic runs. This caused a data consistency issue: `referred_by` was set on a profile but credits were never awarded. **CJ needs to reset `referred_by = null` on the affected profile row and manually verify the `referral_events` table.**

### Pending (as of 2026-06-12)
- **App-wide chrome** — no `not-found.tsx` / `error.tsx` / `loading.tsx`; no shared
  `<Navbar>`/`<Footer>` (re-implemented inline per page); no admin nav link gated on `is_admin`.
  See `docs/BASIC_UI.md §3`.
- **Pre-launch (backend/ops):** Supabase’s built-in dev email service caps at ~2 emails/hour
  (hit while testing `/forgot-password`). Raise the limit or move to custom SMTP (Resend/SendGrid)
  before launch — both forgot-password and signup-confirmation emails ride on it.
- **Optional polish:** quiz-flow progress bar, more toasts/empty-states, mobile pass, a shared
  design system — real gaps, not urgent.

### Key paths
- DeepSeek lib: `src/lib/deepseek/` (client, generate-cards, index)
- Generate route: `src/app/api/generate/route.ts`
- Upload flow component: `src/components/upload/PdfUploadFlow.tsx`
- Test mode flag: `src/lib/dev/pdf-test-mode.ts` — currently `false`
- Supabase browser client: `@/lib/supabase/browser` → `getSupabaseBrowserClient()`
- Auth routes: `/api/auth/login`, `/api/auth/signup`, `/api/auth/logout`
- Contracts (source of truth): `src/lib/contracts.ts`
- Route protection: `src/proxy.ts` (NOT middleware.ts — do not rename)
- .env.local needs: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`, `SUPABASE_SERVICE_ROLE_KEY`
