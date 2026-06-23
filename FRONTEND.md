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
| `/decks/[id]` | `src/app/decks/[id]/page.tsx` | ✅ Done | Deck detail — flip-card viewer; **rename deck**, **add/edit/delete card**, **delete deck**, **share + copy public link**, **export PDF (Pro)**, **study-weak-cards mode**, **quiz history**, quiz CTA |
| `/results/[sessionId]` | `src/app/results/[sessionId]/page.tsx` | ✅ Done | Read-only public quiz-result viewer (no auth) — score showcase + signup CTA. Backed by `GET /api/public/results/[sessionId]` |
| `/public/decks/[id]` | `src/app/public/decks/[id]/page.tsx` | ✅ Done | Read-only public deck viewer (no auth, no edit/quiz) |
| `/quiz/[deckId]` | `src/app/quiz/[deckId]/page.tsx` | ✅ Done | Quiz session — MC / Identification / Mixed |
| `/quiz/[deckId]/result` | `src/app/quiz/[deckId]/result/page.tsx` | ✅ Done | Score, missed-card review, **Living Deck reinforcement notice / Pro upsell**, retry/back |
| `/upgrade` | `src/app/upgrade/page.tsx` | ✅ Done | GCash manual payment — 13-digit ref number form |
| `/rewards` | `src/app/rewards/page.tsx` | ✅ Done | Referral code, **all 4 earn methods** (signup, share-a-deck, write-a-review, complete-profile), claim code, history |
| `/settings` | `src/app/settings/page.tsx` | ✅ Done | Edit name/course (+ **profile-complete reward**), change password, **Preferred style** (dark mode / font size / font picker, live-preview + explicit save), **delete account**, sign out. Export-my-data was removed per product decision (see Known fixes). |
| `/admin` | `src/app/admin/page.tsx` | ✅ Done | Admin-only — approve/reject payments, **verify app reviews**, **user list + grant credits**, **audit log**. ⚠️ reachable only by URL (no nav link) |

> **Global chrome** (v.17): `not-found.tsx` / `error.tsx` / `loading.tsx` now exist at
> the app root, and a shared `<Navbar>` (`src/components/nav/Navbar.tsx`) + `<Footer>`
> replace the per-page inline nav across all ~15 pages. The admin nav link is still
> intentionally absent (reachable only by URL — security-by-obscurity, by request).

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
| `/api/decks/[id]` | GET / PATCH (rename) / DELETE | `/decks/[id]` | ✅ (GET+PATCH+DELETE all wired in UI) |
| `/api/decks/[id]/flashcards` | POST | `/decks/[id]` | ✅ add card |
| `/api/flashcards/[id]` | PATCH / DELETE | `/decks/[id]` | ✅ edit / delete card |
| `/api/decks/[id]/share` | POST / DELETE | `/decks/[id]` | ✅ share / unshare (+ deck_share reward) |
| `/api/decks/[id]/export` | GET | `/decks/[id]` | ✅ PDF export (Pro-gated) |
| `/api/public/decks/[id]` | GET | `/public/decks/[id]` | ✅ unauthenticated read-only |
| `/api/quiz/[id]` · `/api/quiz/result` | POST | `/quiz/[deckId]` | ✅ (server builds questions; atomic + idempotent submit; Living Deck) |
| `/api/quiz/[id]/share` | POST / DELETE | `/quiz/[deckId]/result` | ✅ (v.17) share / unshare a quiz result (toggles `quiz_sessions.is_public`) |
| `/api/public/results/[sessionId]` | GET | `/results/[sessionId]` | ✅ (v.17) unauthenticated public quiz-result read (`get_public_quiz_result()` RPC) |
| `/api/quiz/history` | GET | `/decks/[id]` | ✅ per-deck history |
| `/api/account/preferences` | POST | `/settings` | ✅ (v.17) theme/font sync to the profile row |
| `/api/referral/claim` | POST | `/rewards` | ✅ |
| `/api/rewards/submit-review` | POST | `/rewards` | ✅ write-a-review earn |
| `/api/rewards/claim-profile-complete` | POST | `/settings` | ✅ profile-complete earn |
| `/api/payment/submit` | POST | `/upgrade` | ✅ |
| `/api/account/delete` | POST | `/settings` | ✅ account deletion. (`/api/account/export` was removed — see Known fixes.) |
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

#### Dev server stuck "loading" forever after clearing the Turbopack cache
- **What broke:** `localhost:3000` hung loading indefinitely. The terminal showed a Rust panic — `Persisting failed: Unable to write SST file`, `thread 'tokio-runtime-worker' panicked`.
- **Why:** `.next/` (including Turbopack's persistent cache at `.next/dev/cache/turbopack`) was deleted with `rm -rf .next` **while the dev server was still running and holding open file handles into that cache**. Deleting files out from under a live writer corrupted the on-disk cache. Separately, on Windows `npm run dev` spawns a tree of processes (the `npm` wrapper → `next` CLI → the actual server → a separate PostCSS worker) — stopping only the top-level task left orphaned children holding port 3000, so even a clean restart kept failing with "port already in use" until every PID in the tree was killed.
- **Watch out for:** Always stop the dev server first and confirm it's fully exited *before* deleting `.next/`. On Windows, if a restart won't bind to the port, don't assume one `kill`/`TaskStop` got everything — check `Get-CimInstance Win32_Process -Filter "ProcessId=..."` for each PID's `CommandLine` to find the whole process tree (wrapper + CLI + server + PostCSS worker) and kill all of them together.

---

#### Font picker changed the button highlight but never changed the actual font
- **What broke:** Picking a font pairing in Settings → Preferred style updated the selected-button styling immediately, but the page's actual text kept rendering in the old font. Dark mode and font-size live-previewed correctly — only the font pairing silently failed.
- **Why:** `FONT_PAIRS` defined each pairing as `display: "var(--font-playfair)"` etc., and the preview/commit code set `--font-display: var(--font-playfair)` — a CSS variable whose value is itself another `var()` reference (double indirection). Single-level variable writes (theme, font-scale) repainted live, but this chained assignment did not reliably trigger a repaint in this app's setup.
- **Resolution:** Added `resolveFontVar()` in `src/lib/theme/ThemeProvider.tsx`, which uses `getComputedStyle(document.body).getPropertyValue(...)` to resolve the `next/font` variable to its literal computed value *before* writing it to `--font-display`/`--font-body`, eliminating the second indirection level.
- **Watch out for:** Never assign one CSS custom property to another custom property's `var()` reference if the *consumer* also reads it via `var()` — resolve to a concrete value first, or test that the chain actually repaints. This bug was invisible from the button state alone; always check the actual rendered output, not just which control is highlighted as selected.

---

#### New animations appeared completely inert — "nothing moves, ever"
- **What broke:** After porting the concept HTML's hover-lift, button-press, and fade-up entrance animations into `globals.css`, none of them played in the browser at all — not on hover, not on click, not on page load.
- **Why:** All three animation rules were wrapped in `@media (prefers-reduced-motion: no-preference)`, the standard accessibility convention for skipping motion when a user's OS has "reduce motion" turned on. The testing machine had that OS setting enabled, so the entire block was a no-op — confirmed by the fact that once `prefers-reduced-motion` was identified as the cause, ungating just the hover/press rules made those work immediately, isolating the issue precisely.
- **Resolution:** Hover-lift and button-press stayed ungated (judged low risk for motion-sensitive users). For the fade-up entrance animation, asked the product owner directly whether to respect or override reduce-motion — **explicit decision: always play it, override the OS preference** — so the `@media` wrapper was removed from the `fadeUp` keyframes/classes entirely.
- **Watch out for:** If a future animation addition "does nothing" in testing, check the OS/browser's reduce-motion setting before assuming the CSS is broken — it's very easy to chase a phantom bug here. Any new animation added later needs an explicit decision (not a default) on whether it should respect `prefers-reduced-motion`.

---

#### `/decks/new` upload card was nearly unreadable in dark mode (Tailwind `dark:` classes never adapted to the theme system)
- **What broke:** The whole "Upload PDF" card on `/decks/new` looked grayed-out/disabled in dark mode — heading and body text barely visible against the card background, even though nothing was actually disabled.
- **Why:** `PdfUploadFlow.tsx` predates this session's `[data-theme="dark"]` CSS-variable theming system and was never migrated — it still used Tailwind's `text-zinc-900`/`dark:text-zinc-50`-style utility classes everywhere. Tailwind's `dark:` variant fires off its own strategy (OS `prefers-color-scheme` by default, not this app's `data-theme` attribute toggle), so when a user picked "Dark" in Settings but their OS was light, Tailwind kept rendering the light-mode near-black text (`zinc-900`) against the now-dark card background — unreadable.
- **Resolution:** Rewrote every color-related class in the component (~30 instances: headings, body text, borders, backgrounds, the generation-mode picker, dropzone, OCR/paste/result/error states) to inline styles using the app's CSS variable tokens (`var(--text)`, `var(--bg-card)`, `var(--border)`, `var(--success)`, `var(--error)`, etc.), matching every other page in the app. Kept Tailwind classes only for layout (`flex`, `gap-*`, `rounded-*`, `p-*`) which aren't theme-dependent.
- **Watch out for:** Never use Tailwind's `dark:` variant in this app — it does not track the app's actual dark-mode toggle. Any new component must use the `var(--token)` CSS variables from `globals.css`, never raw Tailwind color utilities (`text-zinc-*`, `bg-white`, etc.), or it will silently break the moment a user's OS preference disagrees with their in-app theme choice.

---

#### Deep Dive (Pro) card's "Upgrade →" / "PRO" badge could push past the card's right border
- **What broke:** On the `/decks/new` Generation Mode picker, the non-Pro "Deep Dive (Pro)" card's trailing "Upgrade →" label (and the "PRO" badge in its title) could overflow past the card's right edge instead of staying inside the rounded border, especially at narrower widths — the row had no fallback once its fixed-width children (icon, badge, "Upgrade →") plus the squeezed title/description text exceeded the card's width.
- **Why:** The card's outer flex row had no `flexWrap`, so once `minWidth: 0` on the description span ran out of room to shrink further (text can only wrap down to its longest single word), the row had nowhere left to go but overflow horizontally. The inner title row (`"Deep Dive (Pro)"` + the "PRO" badge) had the same gap — no `flexWrap`, no `flexShrink: 0` on the badge — so it was vulnerable to the identical failure mode one level down.
- **Resolution:** Added `flexWrap: "wrap"` to both the outer card row and the inner title row, `flexShrink: 0` on every fixed-size child (icon, checkmark, "PRO" badge, "Upgrade →"), and explicit `boxSizing: "border-box"` on both Generation Mode cards. Now if the row genuinely doesn't fit, the trailing label/badge drops to its own line inside the card instead of spilling past the border. Applied to the Standard card too for parity, even though its content is short enough to rarely trigger it.
- **Watch out for:** Any flex row mixing one `flex: 1; minWidth: 0` text block with multiple fixed-width siblings (icons, badges, trailing labels) needs `flexWrap: "wrap"` as the real fix — `minWidth: 0` alone only stops the *text* from forcing overflow, it does nothing once the fixed-width siblings alone already don't fit.

---

#### Hover-lift stopped working on any card that also had the fade-up entrance animation
- **What broke:** Dashboard/Settings cards with both `anim-fade-up*` and `hover-lift` classes stopped lifting on hover — but a card with `hover-lift` alone (e.g. the dashboard's "+ New deck" button) still worked fine.
- **Why:** The `fadeUp` keyframes animated `transform: translateY(...)` with fill-mode `both`. A CSS animation — even after it finishes — keeps overriding any property it touched as long as its fill-mode keeps applying, which silently blocks a separate `:hover { transform: ... }` rule from a different class on the same element. `hover-lift` and `fadeUp` were both fighting over `transform`; `fadeUp` always won.
- **Resolution:** Changed `fadeUp` to animate `margin-top` instead of `transform` (same visual slide-up effect, different property), freeing `transform` for `hover-lift` to control exclusively.
- **Watch out for:** Never have two different animation/transition mechanisms target the same CSS property on the same element — one (usually the `animation`, due to fill-mode) will silently and permanently win, and the bug looks exactly like "hover stopped working" with no console error. If a future animation needs to move an element, prefer a property `hover-lift`/other transitions don't also touch.

---

#### Fixed a public asset's bytes, but the browser (and the dev server) kept showing the old version
- **What broke:** Re-processed `teaching-capy.png` to remove a baked-in white background, verified via `sharp` that the file on disk had real alpha — but the quiz page kept rendering it with a solid white box around the character. Restarting the dev server didn't help either.
- **Why:** Two layers of caching, only one of which a restart clears. (1) The browser may cache a decoded `<Image>` by its `/_next/image?url=...&w=...&q=...` URL, which doesn't change just because the *source file's bytes* changed — fixed by a hard refresh. (2) The real culprit here: Next.js's dev-mode image optimizer persists its own optimized-variant cache **to disk** at `.next/dev/cache/images/` (not the classic `.next/cache/images` path some older docs/blog posts reference — this app is on a Next.js version with breaking changes per `AGENTS.md`). That cache survives a full dev-server **restart**, because it's on disk, not in memory — confirmed by curling `/_next/image?...` with a Chrome-like `Accept` header and seeing `X-Nextjs-Cache: HIT` serving a stale, alpha-flattened WebP immediately after a clean restart.
- **Resolution:** `rm -rf .next/dev/cache/images` (just that subfolder, not all of `.next`), then re-curled the same URL — `X-Nextjs-Cache: MISS`, fresh WebP, real alpha at the corners this time.
- **Watch out for:** If you edit a `public/` image's *bytes* in place (same filename) and the running app keeps showing the old version no matter how many times you reload, suspect `.next/dev/cache/images/` before suspecting the source file or the browser. A simple way to confirm which layer is stale: `curl` the `/_next/image?url=...` endpoint directly with `-H "Accept: image/webp"` and check the `X-Nextjs-Cache` response header — `HIT` means the optimizer's disk cache is serving something it computed before your edit.

---

#### Edited `globals.css` repeatedly, hard-refreshed every time, hover styling never changed
- **What broke:** Iterating on the "Got it"/"Review again" hover styling — three separate CSS edits in a row (color tokens, then the indicator-bar position, then toning down the colors) — and the browser kept rendering the *first* version no matter how many hard refreshes (Ctrl+Shift+R) happened.
- **Why:** Same root cause family as the image-cache bug above, different cache. Turbopack's dev server has its own **persistent on-disk** build cache at `.next/dev/cache/turbopack/`. Confirmed by fetching the actual compiled CSS chunk URL directly via `curl` (not the browser) and regex-extracting the `.btn-review-*` rules from it — the served chunk's rule bodies matched the *original* commit, byte for byte, even after editing the source file and doing a full dev-server **restart** (kill + `npm run dev` again). The persistent cache survived the restart because it lives on disk, not in the killed process's memory.
- **Resolution:** `rm -rf .next/dev/cache/turbopack` (in addition to killing and restarting the server — a restart alone wasn't enough), then re-fetched the compiled CSS chunk directly to confirm the new rule bodies were actually present before asking for another visual check.
- **Watch out for:** A hard browser refresh only invalidates the *browser's* cache — it does nothing for a stale *server-side* compile. If a CSS (or likely JS) change isn't showing up no matter how aggressively you refresh the browser, verify what the dev server is actually serving before blaming the browser: find the compiled chunk URL (`grep -o 'href="[^"]*\.css"'` on a fetched page), `curl` it directly, and check whether your edit is actually in that response. If it's stale even after a clean restart, the fix is clearing `.next/dev/cache/` (or the specific subfolder — `images` for the optimizer, `turbopack` for compiled output), not just restarting the process.

---

#### Study mode: answering the last card while earlier cards were still unanswered left you stuck there
- **What broke:** `/decks/[id]`'s flip-card flow lets you jump to any card via the prev/next arrows or the dot indicators — nothing requires answering in order. Jump straight to card 20 of 20, answer it, and auto-advance (`goTo(Math.min(total - 1, currentIdx + 1))`) clamped right back to the same last card forever, with cards 1–19 still unanswered and no way back to them short of manually clicking through each one.
- **Why:** Auto-advance only ever looked at `currentIdx + 1`, clamped at the end of the deck — it had no concept of "which cards are still unanswered," so it couldn't route around ones you'd skipped past via free navigation.
- **Resolution:** Added `reviewedThisVisit` (a `Map<string, boolean>` of card id → outcome, answered during this page visit — deliberately *not* the same thing as the backend's `times_seen`, which also counts past quiz attempts and would have made "unanswered" mean something different from "unanswered this visit") and a `findNextUnanswered()` search that walks forward from the current card, wrapping back to the start of the deck, returning the first id not yet in that map. Auto-advance now calls this instead of the raw clamp, so finishing the last card routes you back to whatever's still outstanding earlier in the deck. (Started as a `Set<string>`, upgraded to a `Map` once the dot indicators also needed the per-card outcome to badge green/red, not just membership.)
- **Watch out for:** Any "auto-advance" or "auto-pick-next" logic on a view that also allows free/random navigation needs to reason about *what's actually left to do*, not just "the next index" — clamping or wrapping blindly by position silently assumes a linear pass that free navigation doesn't guarantee. Found and fixed in the same pass: `submitCardReview()` updated `difficulty_score` in local state on success but never incremented local `times_seen`, which would have kept the "Study weak cards" gate (added the same session) locked all session even after a genuine full pass, until a page refresh re-fetched the real counts from the backend.

---

#### Nav cluster hugged the left edge once it wrapped onto its own line, instead of staying right-aligned
- **What broke:** On `decks/new` (and every other page sharing the same nav shape) at narrow widths, once the right-side cluster (Capycoin pill, nav links, avatar) wrapped beneath the logo, it sat flush against the left edge — directly under "← Back" — instead of staying right-aligned like it is on wider screens.
- **Why:** The outer row uses `justify-content: space-between`, which distributes space *between* two-or-more items sharing the same flex line. Once the cluster wraps onto its own line alone, it's the only item on that line — there's nothing left to space "between," so it falls back to `flex-start` (the left edge).
- **Resolution:** Added `margin-left: auto` to `.nav-cluster` (`globals.css`). This pushes the cluster right regardless of whether it's sharing a line with the logo or has wrapped onto its own — `space-between` and `margin-left: auto` don't conflict, they just both want the same outcome from different mechanisms.
- **Watch out for:** Any flex row using `justify-content: space-between` with `flex-wrap: wrap` needs an explicit fallback like `margin-left: auto` on the item that should stay right-aligned once it's wrapped alone — `space-between` silently stops doing anything useful the moment only one item occupies a line.

---

#### iPhone XR/Galaxy-S8+-width nav still wrapped even after the first round of mobile-responsiveness fixes
- **What broke:** The mobile nav-wrap pass (`.nav-row`/`.nav-cluster`, documented in Pending below) stopped *clipping*, but on real narrow phones (iPhone XR @ 414px, Galaxy S8+ @ 360px) the wordmark + Capycoin pill + Rewards + Help + avatar still didn't fit on one line even with `.nav-collapse` hiding "Capycoins" — the whole right cluster wrapped under the logo onto its own row.
- **Why:** The original fix only changed *whether* the row wraps (graceful, no clipping) — it never reduced how much horizontal space the row's own gaps/padding/avatar size actually demanded. At 414px and especially 360px, those demands still exceeded the available width even after the lowest-priority text collapsed.
- **Resolution:** Two additional, width-isolated tiers in `globals.css`, both using `!important` (required because the gaps/padding/sizes they override are inline styles in each page's JSX, which otherwise always beat a plain class rule):
  - `@media (max-width: 480px)`: tightens `.nav-cluster` gap, `.nav-coin-pill` padding/gap, `.avatar-wrap` margin, `.avatar-pic` size (40px) — enough to bring the iPhone XR/14 Pro class of phone back to one line.
  - `@media (max-width: 390px)`: a second, more aggressive tier (new `.nav-wordmark`/`.nav-link` font-size overrides too) for genuinely small phones (Galaxy S8+ and similar ~360px Androids) — avatar down to 32px, gaps down further.
  - Each tier is bounded by its own `max-width`, so tightening the small-phone tier cannot regress anything wider (iPhone 14 Pro, tablet, desktop keep the looser sizing). New `.nav-coin-pill` class added to the dashboard and `decks/new` pill divs so the breakpoints have something to target (previously inline-only, unreachable from CSS).
- **Watch out for:** "Stops clipping" and "fits on one line" are two different bars — flex-wrap alone only guarantees the first. If a future device report says something still wraps after `.nav-row`/`.nav-cluster` are already in place, the fix is almost certainly tightening an existing breakpoint's gaps/sizes (or adding a narrower one), not redesigning the wrap logic itself. Don't over-tighten in one shot either — the first attempt at the 390px tier (gap 4px, avatar 30px, margin 0) was reported as visually "compressed"; eased back to gap 7px/avatar 32px/margin 3px after feedback. Leave real breathing room, verify on the actual narrowest target device, and remember `!important` is genuinely required here (not sloppy CSS) because the values being overridden are inline.

---

#### Stale Turbopack dev cache served the *old* CSS even after killing and restarting the dev server (3rd time this exact bug class has bitten this app)
- **What broke:** Edited `globals.css` (the 390px nav tier above), confirmed the source file had the new rules, but the running browser kept showing the old, untightened spacing no matter how many hard refreshes happened. Killing the dev server process and running `npm run dev` fresh **did not fix it either** — `curl`ing the actual served CSS chunk both before and after the restart returned byte-identical output, missing the new rules.
- **Why:** Same cache family as the two prior entries below (`.next/dev/cache/images/` and `.next/dev/cache/turbopack/`), but this occurrence is the proof that a plain process kill + `npm run dev` restart is **not sufficient** — Turbopack's persistent on-disk cache survives a cold process restart, not just Fast Refresh/HMR. Only deleting `.next` itself forced a genuinely fresh compile (confirmed: CSS chunk byte size changed from 70,880 → 71,328 bytes, and the new rules appeared in the served output).
- **Resolution:** `rm -rf .next` (the whole directory, not just a subfolder this time — done with the server already stopped, per the existing "stop first, then delete" rule from the entry below) then `npm run dev` again.
- **Watch out for:** If a CSS/JS change isn't showing up and you've already (a) hard-refreshed the browser and (b) killed + restarted the dev server, and it's *still* stale — don't keep restarting, go straight to `rm -rf .next` (server stopped first) before doing anything else. Verify the fix the same way every time: `curl` the page for its `<link>`/CSS chunk URL, `curl` that chunk directly, and `grep` for the specific new rule/string you just added — don't trust "the terminal said Fast Refresh rebuilt" as proof the *served* output actually changed, it isn't.

---

#### Perfect-score "N / N 🎉" text wasn't centered, even though the underlying image was
- **What broke:** On the quiz result page's perfect-score state, the score text ("5 / 5 🎉") looked off-center — confirmed twice by the user despite the mascot image itself being verified pixel-centered via a `sharp` bounding-box check.
- **Why:** The emoji was part of the same centered text block as the digits. Centering a string centers its *total rendered width* — the trailing 🎉's extra width pulled the visual weight of the digits themselves to the left of true center, even though the whole string (digits + emoji) was correctly centered as a unit.
- **Resolution:** Moved the 🎉 into its own absolutely-positioned decorative `<span>` outside the text flow, so the digits ("5 / 5") center independently without the emoji's width affecting their layout.
- **Watch out for:** A decorative trailing emoji/icon inside an otherwise-numeric or short text block will visually skew that block's perceived center even when the CSS centering is technically correct — if a centered short string "looks" off-center despite the math checking out, suspect a non-text decoration riding along inside the same centered span before re-measuring the underlying content.

---

## Notes for Teammates

- **✅ SHIPPED — AI "teaching lesson" on wrong quiz answers.** Built during the 2026-06-18→20
  session, reverted 2026-06-21 (it touched backend-owned `contracts.ts`/`schema.sql` from a
  frontend-scoped session), then re-implemented the same day with backend sign-off. Now live:
  new cards carry a baked-in `explanation`, older cards use the `POST /api/quiz/explain` live
  fallback, and the quiz wrong-answer banner renders Capy's "why" paragraph (now a dedicated
  sidebar as of 2026-06-22, see Version History). Design record + implementation notes in
  `docs/PROPOSAL_QUIZ_EXPLANATION.md`.
- **🔴 NEED SOON (backend) — `/api/quiz/explain` latency on old cards (10-30s).** A real
  DeepSeek round trip every time, because the route has no `flashcardId` and never writes the
  result back to `flashcards.explanation` ("no DB write, free bonus" — see the route's own
  comment). That means the same old card pays the full live-AI cost on *every* wrong answer,
  forever, rather than once. Frontend added a `sessionStorage` cache (per browser tab, not
  persistent) as a stopgap — see `src/app/quiz/[deckId]/page.tsx`'s `EXPLANATION_CACHE_KEY`.
  The real fix is a backend one: accept `flashcardId` in `ExplainAnswerRequest` and persist the
  result to that row's `explanation` column on success, so it becomes baked-in for every future
  student who hits that card, not just the current browser tab. Not done from this session —
  crosses the `contracts.ts`/`schema.sql` boundary, needs backend sign-off first. Still open as
  of 2026-06-23 — flag to the backend dev directly, this is the one concrete backend ask
  sitting out of this whole session's work.
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
| v.07 | **Theming + polish pass.** New "Preferred style" section in Settings — dark mode (Night Lamp palette), font-size adjuster, and a 5-pairing font picker, all wired through a new `ThemeProvider` (`src/lib/theme/ThemeProvider.tsx`) with live-preview-then-explicit-Save UX (anti-flash inline script in `layout.tsx`, localStorage-only persistence, whole app re-themed via CSS custom properties, not per-page). Header/nav fixed to span the full width and sit at the screen corners (`maxWidth: 1200` → `"100%"` across all app pages); the active page's own nav label now bolds/colors itself; every header nav link/button got a hover state (`.nav-link` class in `globals.css`). New hover-lift / button-press / fade-up animation system ported from the design concept (fade-up explicitly overrides `prefers-reduced-motion` per product decision — see Known fixes). **Export-my-data removed entirely** per product decision — deleted `/api/account/export`, `exportAccountData()`, its tests, and the Settings UI for it. Renamed all user-facing "credits" copy to "Capycoins" (display text only — `deduct_credit()`, `ApiErrorCode.INSUFFICIENT_CREDITS`, `token_balance`, and other internal identifiers were deliberately left unchanged). Added 3 new Capy character images (`public/capy/teaching-capy.png`, `congrats-capy.png`, `capycoin.png`) — teaching-capy on a wrong quiz answer, congrats-capy on a perfect quiz score, capycoin replacing the 🪙 emoji on every balance display. Typecheck/build/72-test suite all green (3 export tests removed). |
| v.09 | **Swapped the beaver emoji for real Capy artwork, everywhere.** `🦫` (the literal beaver emoji — there is no capybara emoji in Unicode, flagged as a known gap in `docs/DESIGN_PROPOSAL_CAPY_CALM.md`) was still in use as the mascot on every single page: the nav logo (24px) on all 13 pages, plus the larger loading/empty/error-state mascot (48–56px) on `/`, `/login`, `/signup`, `/settings` (reset-password view), `/dashboard`, and the quiz-result/public-deck "not found" states. Replaced all 22 instances with the existing `public/capy/capy-idle.svg` artwork (a real capybara, already in the repo but never wired up). Typecheck + full 72-test suite green. |
| v.17 | **Backend + structural close-out: shareable quiz results shipped, theme sync to the profile, shared Navbar/Footer + global error boundaries, dark public pages.** Built the backend the v.15/v.16 "Share this result" UI was waiting on: new `quiz_sessions.is_public` column, a `SECURITY DEFINER get_public_quiz_result()` RPC (returns only a narrow public projection — deck title + score, never owner internals — for `is_public = true` completed sessions, so the deck can stay private while the score is shared), `setQuizSessionPublic()`/`getPublicQuizResult()` db helpers, and two routes — `POST/DELETE /api/quiz/[id]/share` (owner-only, rate-limited; mirrors the deck-share route minus the referral credit) and `GET /api/public/results/[sessionId]` — so the previously-dead toggle and `/results/[sessionId]` page now work end-to-end. **Theme/font now sync across devices**: three nullable `profiles` columns (`theme_preference`/`font_size_preference`/`font_pair_preference`), extended `updateOwnProfile()` allow-list, a new `POST /api/account/preferences` route (Zod-validated against the contracts domain arrays), login returns the prefs and `AuthCard` hydrates them into localStorage, and Settings' Save fires a fire-and-forget sync — localStorage stays the local source of truth, the profile is the cross-device backstop. **Removed the avatar "Capy styles" coming-soon gallery** (and its `tapeStyle` helper, `UIMessages.avatarStylesUnavailable`, and the `avatar-styles-grid.png` asset) for launch; the real upload card is now the page's sole focus. **Added global `error.tsx` (client boundary w/ Try-again + home), `not-found.tsx` (branded 404), and `loading.tsx` (shared spinner)** at the app root. **Extracted a single configurable `<Navbar>` (`src/components/nav/Navbar.tsx`) + `<Footer>` and migrated all ~15 pages' inline nav onto it** (props: backHref, wordmark/centered/linked wordmark, section label, coin pill, Pro badge, name chip, links, avatar menu, `rightContent` escape hatch for the bespoke quiz-counter / public-CTA / admin-name right sides) — closes the long-standing "no shared Navbar/Footer" chrome gap; coin-pill/wordmark/row-height normalized to one consistent shell. **Deck-detail delete-deck button confirmed present** (the old "no UI button" note was stale). **Upgrade page**: pricing copy changed from one-time → `₱150/month` (badge `₱150/mo`), and the centered "Crammable" wordmark now links to `/dashboard` (back button kept). **Public/logged-out pages (`/`, `/login`, `/signup`, `/forgot-password`) now default to a fixed dark + Baskerville look** (flipped from forced-light in both `ThemeProvider` and the anti-flash script) for a consistent first impression; added `suppressHydrationWarning` to `<html>` since the anti-flash script intentionally mutates it pre-hydration. Fixed a routing conflict from the share work (`api/quiz/[sessionId]` → `[id]`, since Next requires one slug name per dynamic level). Two prod Supabase migrations applied (shareable-results column+RPC, theme columns) and verified. `npx tsc --noEmit` clean, `next build` green, full 72-test suite green throughout. |
| v.16 | **Avatar account-menu polish, per-page wordmark decisions, and a real mobile nav fix (closes out the responsiveness work started in v.15).** `AvatarPicker.tsx` converted from hover-reveal to **click-toggle** (`open` state + a `mousedown` outside-click listener via a wrapper `ref`) since hover doesn't work on touch devices anyway; the dropdown now shows the user's email Gmail-style at the top (fetched via `supabase.auth.getUser()`), the card itself enlarged (`min-width` 200→240px, more padding), and the avatar circle resized again (40→44px) with extra right margin. **Per-page "Crammable" wordmark decisions** — established this is a per-page judgment call based on actual crowding, not a blanket rule: removed entirely from `/quiz/[deckId]`, the quiz result page, `/decks/new`, and `/rewards` (replaced with "Topic: {title}" on the quiz setup screen); **centered** (new `position:absolute; left/top:50%; transform:translate(-50%,-50%)` pattern) on `/upgrade` and `/help` instead, since those pages still had room either side and removing it wasn't necessary; **removed then explicitly restored** on `/dashboard` after an iPhone-XR screenshot was initially misread as the cause (it was actually the iPhone 14 Pro reference fitting fine) — Yujin's call: keep the wordmark on dashboard, "find a way the UI remains consistent," which is what the nav-breakpoint fix below is for. **Quiz "Correct!" feedback redesigned from a full-width banner into a small rotated stamp** overlaid on the question card's top-right corner (`position:absolute`, `transform:rotate(-8deg)`, `pointerEvents:"none"`) — the old banner pushed the action buttons down a whole extra row every time an answer was correct; the stamp doesn't affect layout at all. Dashboard's "Free"/"Pro" plan-card label shrunk (`26px`→`20px`font) since a 4-letter word at digit-sized type looked disproportionate next to the single-digit stat cards beside it; the Capycoins stat card enlarged instead (padding 16→22px, icon 44→56px, number 26→32px) to read as the primary credit indicator, not just another equal-weight stat. **Real mobile nav fix, two new breakpoints** (`globals.css`) — `.nav-row`/`.nav-cluster` from v.15 stopped *clipping* but still let the whole cluster wrap under the logo on real narrow phones; added `@media (max-width: 480px)` (tightens gap/padding/avatar to 40px, fits iPhone XR/14 Pro on one line) and `@media (max-width: 390px)` (more aggressive — avatar 32px, smaller wordmark/link font, fits ~360px Androids) — see Known Fixes for the full debugging arc, including a 3rd recurrence of the stale-Turbopack-cache bug that required `rm -rf .next` (not just a process restart) to actually serve the new CSS. Fixed a real centering bug found along the way: the perfect-score "N / N 🎉" text wasn't centering correctly because the trailing emoji's width was pulling the digits' visual center left — moved the emoji into its own absolutely-positioned decorative span outside the text flow (see Known Fixes). `npx tsc --noEmit` clean and the full 72-test suite green throughout every change in this entry. |
| v.15 | **Copied UI mockups #7/#7b ("Quiz results") and #9 ("Avatar system") onto the real app; new Help & Support page.** Quiz results (`src/app/quiz/[deckId]/result/page.tsx`): replaced the flat percentage/label with an animated SVG score ring (count/total, fills on mount via a `ringAnimated` state flip), a Capy reaction bubble using the user's *actual* uploaded avatar plus a score-banded Taglish message (90+/75+/60+/below), relabeled the breakdown grid "Correct ✓"/"Review again" with moss/clay-style coloring, and reordered actions to ← Back to deck / Review N wrong (scrolls to the missed-cards list) / Try again ↺, with Dashboard kept as a small secondary link. **Perfect-score variant (#7b)**: swaps to `congrats-capy.png` (bobbing), "N/N 🎉", and a 2-button set (← Back to deck / Try a harder deck →) — the breakdown grid is hidden since it'd be redundant. **Avatar system (#9)**: a new dedicated `/settings/avatar` page (not a Settings sub-section — corrected mid-build after first building it in the wrong spot) replaces the nav tooltip's inline upload trigger. Left card shows the concept's actual `ALL Selection.png` sticker-set art (copied from `ui-concept/`, re-encoded losslessly via `sharp` at 640×960 — first compression pass used PNG palette quantization and visibly banded/blurred, redone with `palette: false`) sized to 260px and crossed with two decorative CSS "tape" strips reading "COMING SOON," plus a `.tooltip-wrap`/`.tooltip-bubble` hover ("This is unavailable for now.", new `UIMessages.avatarStylesUnavailable`) since none of those styles have real per-style art yet. Right card is the one actually-real part: upload now stages a **preview before committing** (`previewSrc` state) with explicit Save changes/Cancel buttons instead of applying on file-select — "Use default Capy" was folded into the same preview/confirm flow rather than resetting instantly, since a misclick could otherwise wipe a custom photo with no confirmation; removed the same "Use default Capy" shortcut from the nav tooltip entirely (it only lives on the dedicated page now) per Yujin's "looks bad that u can just click... accidentally." Renamed "Your Capy"/"YOUR CURRENT CAPY" → "Your Profile"/"Profile picture" since Capy is the mascot, not the user. New `Routes.avatar` (`/settings/avatar`). **New `/help` page** (`Routes.help`): contact card (`App.supportEmail`, changed to `crammablesupport@gmail.com` per Yujin — not created yet, co-devs to set up) plus 5 FAQ entries (AI/consent, Free vs Pro limits, pending Pro payment, account deletion, generic "something's broken"), linked from the dashboard nav next to Settings — not rolled out to every page's nav, since that's the same already-tracked "no shared Navbar/Footer" gap, not a new one. Also fixed a real spacing bug on `/settings` (the Session and Danger Zone cards rendered with zero visible gap despite `marginTop: 16` on Danger Zone — added an explicit `marginBottom: 16` on Session directly rather than relying on the next element's margin, and proactively cleared the Turbopack dev cache since this exact "code looks right but doesn't render" symptom matched a documented stale-cache bug from earlier in the week). `App.version` bumped `v.14` → `v.15` (not pre-confirmed with Yujin before bumping — flagged to him after the fact, he said keep it). `npx tsc --noEmit` clean and the full 72-test suite green throughout; zero new lint errors (only the same pre-existing `<img>`-vs-`next/image` warnings already present elsewhere in the codebase). **Also added a "Share score" button on the result page** (both perfect and non-perfect branches): builds a 1080×1080 PNG card client-side via `<canvas>` (background/text colors pulled live from the active theme's CSS vars so it matches light/dark, mascot art + score + reaction headline + deck title + app branding drawn directly, no DOM screenshot library). On share-capable browsers (`navigator.canShare({ files })`) it opens the native share sheet with the image + a generic homepage link (`window.location.origin + Routes.home`); otherwise it downloads the PNG and copies the homepage link to the clipboard (kept as a secondary "download score card" option). **Pivoted same session:** after seeing the Windows native share sheet for the PNG, Yujin decided he wants the real thing — a per-result deep link — and explicitly approved the backend work this requires. Built the **frontend half now, backend pending**: `QuizResultData.sessionId` now flows from `submitFinalResult()` through to the result page; a new "Share this result" card (`toggleResultShare()`/`copyResultLink()`, mirrors the existing deck-share card almost exactly) toggles `isPublic` and shows a copyable `Routes.publicResult(sessionId)` link; a new public page `src/app/results/[sessionId]/page.tsx` mirrors `/public/decks/[id]/page.tsx` (read-only score showcase + signup CTA). New `contracts.ts` entries: `Routes.publicResult`, `ApiPaths.quizResultShare`/`publicResult`, `ShareQuizResultResult`, `PublicQuizResult` — all explicitly commented `NOT YET IMPLEMENTED`. None of it works yet (the backend route doesn't exist — every toggle/fetch correctly shows its error state), by design: full backend requirements (new `quiz_sessions.is_public` column, RLS policy, two routes) are spelled out in the Pending section below for whoever picks it up. |
| v.14 | **Copied UI mockup #4 (`ui-concept/v1/capy-lofi-concept.html`, "Generating — Capy is on it") onto `PdfUploadFlow.tsx`'s uploading/generating screen.** Was a bare capy-reading image + spinner + one status line; now a title ("Reading your PDF, hang tight…"), a deck-name/card-count subtitle, a 3-row checklist ("Extracted your text" / "Finding key concepts…" / "Writing your flashcards"), a progress bar, and a "Capy will use 1 Capycoin for this" footer. Two deliberate adaptations from the literal mockup, since the real data isn't available the way the concept assumes: (1) page count — the production `/api/upload` response doesn't return a page count at all (`pageCount` only exists on the `PDF_EXTRACTION_TEST_MODE`-only debug payload), so "Extracted text from N pages" only shows a real number when OCR ran (`pageProgress.total`, Layer 2) and falls back to "Extracted your text" otherwise rather than fabricating a figure; (2) the "Finding key concepts…"/"Writing your flashcards" split is a timer-based approximation (`genStage`, advances via one `setTimeout` ~2.5s into the call) — `/api/generate` is a single opaque DeepSeek round trip with no real sub-progress signal, so this is "perceived progress" in the same spirit as the concept's own "no blank spinner" intent, not a measured metric. Real signal kept honest where it exists: row 1 ("Extracted your text") is driven by an actual phase transition (`phase === "uploading"` → `"generating"`), only rows 2/3 are simulated. The footer's remaining-balance count (third adaptation, originally dropped) was added back per Yujin's "can we not do #3?" — `checkConsent()`'s existing profile read picked up `token_balance` alongside `consent_deepseek`/`subscription_tier` (one extra column on a query this component already runs, no new fetch), and the footer now reads "Capy will use 1 Capycoin · N remaining" with a real number. Worded as *anticipated* ("will use," not "used") rather than copying the concept's past-tense "Capy used 1 credit" — the backend only deducts on a *successful* generation (never on AI failure, per the standing rule), so claiming it's already used while the call is still in flight would be stating something not yet true if it ultimately fails. Cleaned up `statusLine` while in this code — it was the only thing the old block displayed, and replacing that block left it write-only everywhere else (lint caught it: `'statusLine' is assigned a value but never used`); removed the state and all ~8 `setStatusLine(...)` call sites rather than leaving dead code. Also fixed a `react-hooks/set-state-in-effect` lint error introduced by the first draft of the new `genStage` timer (was resetting state synchronously inside the effect body on phase change) by moving that reset into `callGenerate()`'s existing `setPhase("generating")` call instead, leaving the effect to only set state from its `setTimeout` callback. `npx tsc --noEmit` clean, `npm run lint` shows zero new errors/warnings (3 pre-existing `set-state-in-effect` errors elsewhere in the codebase, untouched), full 72-test suite green. |
| v.13 | **Copied UI mockup #5 (`ui-concept/v1/capy-lofi-concept.html`, "Flashcard — study mode") onto the real `/decks/[id]` flip-card viewer — "✓ Got it" / "✗ Review again" self-report buttons, with real backend persistence** (confirmed with Yujin via AskUserQuestion — full persistence, not a visual stub). Reused the existing-but-previously-unused `apply_card_review()` RPC (schema §4.12) and its `applyCardReview()` TS wrapper — no schema changes. Added `getFlashcardById()` to `src/lib/db/flashcards.ts`, a new `POST /api/flashcards/[id]/review` route (mirrors the sibling PATCH/DELETE route's CSRF/auth/rate-limit/RLS-404 pattern), and `ReviewCardRequest`/`ReviewCardResult` + `ApiPaths.flashcardReview`/`RateLimits["/api/flashcards/[id]/review"]` in `contracts.ts`. The server computes the new `difficulty_score` itself (same nudge formula `submit_quiz_result()` uses) rather than trusting a client-supplied value, since self-reported review has no answer to grade against. Frontend: two new buttons below the flip card on `/decks/[id]/page.tsx`, styled with the theme's `--success`/`--error` tokens (matching the mockup's moss/clay colors) plus `!important` hover swaps (`.btn-review-correct`/`.btn-review-wrong` in `globals.css`) per this session's established hover-fix pattern. **Also added a quiz sub-type default picker to `/decks/[id]`** — Yujin pointed out the existing Multiple Choice/Identification/Mixed picker only ever appeared on the quiz page's own setup screen, with no way to see or set it from the deck page. New `src/lib/quiz/defaultQuizType.ts` (localStorage, keyed per deck — a lasting preference, not a `pauseState.ts`-style transient session value) backs a 3-chip row in the bottom Quiz CTA section; selecting a chip there pre-selects that type as the quiz page's `selectedType` initial state (still changeable on the actual setup screen before starting — a default, not a lock, confirmed with Yujin). Self-report buttons then went through several rounds of hover/styling feedback (Discord-reference hover effects, repositioned and toned down — see Last Session below for the full iteration and the Turbopack stale-CSS-cache bug it surfaced), and a final UX pass: relocated and reworded the "Click card to flip" hint (now "Click card to view answer" / "Click card to flip back", sitting between the card and the Got it/Review again buttons instead of the top header row), plus auto-advancing to the next card immediately after either button is clicked instead of requiring a manual Next click — which itself now auto-flips the card to reveal the answer first (smooth, existing 0.4s rotation) if it wasn't already flipped, with a short floor delay so the flip is never cut off by a fast API response, before advancing. The quiz pills' hover (`.quiz-pill:hover`) lost its lift/shadow per feedback ("looks like it's moving") — now a plain background swap, same register as the quiz-type chips. **Gated "Study weak cards" on having completed one full pass of the deck** — Yujin asked whether it touches the backend (it doesn't; `studyWeakMode` is a pure client-side re-sort of the already-loaded `cards` array by `difficulty_score`, no API call) and pointed out that sorting by difficulty is meaningless before every card has been reviewed at least once, since `difficulty_score` sits at its untouched default until then. New `hasCompletedFullPass = cards.length > 0 && cards.every(c => c.times_seen > 0)` (`times_seen` is bumped by both study-mode review and quiz answers, so either counts); the button locks with the same `tooltip-wrap`/`title` pattern Export PDF (Pro) already uses, new `UIMessages.studyWeakCardsLocked` copy. A `useEffect` also drops out of weak-cards mode automatically if a newly-added card (fresh `times_seen: 0`) flips a deck from "fully passed" back to not, mid-session. **Fixed a real bug Yujin caught: auto-advance could strand you on the last card.** Free navigation (arrows/dots) lets you jump straight to card 20 of 20 without ever answering 1-19; answering just that one then clamped at `total - 1` forever, with no way back to the unanswered cards short of manually clicking through. New `reviewedThisVisit` (a `Set<string>` of card ids answered this visit, separate from `times_seen` which persists across past sessions) plus a `findNextUnanswered()` wrap-around search — auto-advance now routes to the next not-yet-answered card, wrapping back to the start of the deck if needed, instead of clamping at the end. Also fixed an adjacent gap found while in the same code: `times_seen` was never incremented in local state after a study-mode review (only `difficulty_score` was), which would have kept "Study weak cards" locked all session even after a real full pass, until a refresh re-fetched from the backend. See Known Fixes below for the full writeup. **Added an answered badge to the dot indicators**, per Yujin's suggestion — `reviewedThisVisit` upgraded from `Set<string>` to `Map<string, boolean>` (card id → outcome) so the dots can badge green/red, not just track membership. Fixed a latent bug found while wiring this up: the dots always mapped over `cards` (raw insertion order) instead of `displayCards` (the order actually shown, which "Study weak cards" mode re-sorts) — harmless before since it only used the index, but would have badged the wrong card's outcome once weak-cards mode was active. **Then fixed the badge itself per feedback** — the first version had the current dot's gold fill fully override its own answered color, so a card you were currently sitting on couldn't show whether it was already answered, and the "current" dot blended into the row at a glance (confirmed via `AskUserQuestion` which exact problem it was). Reworked so position and outcome are two independent visual channels instead of one fighting over fill: outcome is always the dot's fill color (gray/green/red, current or not), current-ness is always a `1.5px solid var(--primary)` gold ring + the wider pill shape, regardless of what color it's filled with. **Then removed the 12-dot cap entirely** — Yujin caught that once you're past card 12 (e.g. "Card 18 of 20"), the row only ever rendered dots for the first 12 cards plus a plain "+8" text count for the rest, so there was no dot at all to show your current position or any answered badge for cards 13 onward. Dropped the `.slice(0, Math.min(total, 12))` cap and the "+N" span — every card now gets a real dot, and the row (`flexWrap: "wrap"`) wraps onto extra lines for decks too long to fit one row rather than truncating information. `npx tsc --noEmit` clean and the full 72-test suite green. |
| v.12 | **Merged `main`'s live explanation feature into `FrontEnd`; gave it a real quiz-page UI; theming/animation polish pass.** Pulled `origin/main` (commit `1d5c002`, the backend dev's re-implementation of the wrong-answer "teaching lesson" — `flashcards.explanation` column, `ApiPaths.explainAnswer`/`POST /api/quiz/explain`, `Flashcard.explanation`/`GeneratedCard.explanation`/`QuizQuestion.correctExplanation`) into `FrontEnd`; `contracts.ts` merged cleanly, only `src/app/quiz/[deckId]/page.tsx` and this file had real conflicts, both resolved. Built a dedicated wrong-answer sidebar on the quiz page (`flex` row, main column + `flex: "0 0 220px"` sidebar) instead of `main`'s inline banner: a CSS-only `.speech-bubble` (no image asset — the bubble tail is a rotated `::after` square) showing "Not quite — Capy's got you" plus the live `explanation`/`explanationLoading` state, next to a 96×96 `teaching-capy.png` card. Removed `teaching-capy.png`'s baked-in white background (same `sharp` flood-fill-from-edges technique as `capy-reading.png` below — was colorType 2/opaque RGB, now genuine alpha, 1.64MB → 74KB). New `public/capy/capy-reading.png` (capybara-reading-a-PDF art, background removed + resized/compressed) replaces the bare spinner during `PdfUploadFlow.tsx`'s uploading/generating phase, with a gentle CSS bob animation. `AuthCard.tsx`'s Sign up/Log in toggle link got a hover state (`.text-link` class) and the mode switch now crossfades (`anim-fade-up` keyed on `mode`) instead of jumping, both modes aligned from the top instead of center-jumping; signup form spacing tightened to fit without scrolling (Gizmo-referenced). Fixed a real bug: dark mode was persisting onto public marketing/auth pages after logout, since it's a localStorage device preference with no "log out" concept — `ThemeProvider.tsx` and `layout.tsx`'s anti-flash script now force light theme on `contracts.ts`'s `// Public`-tagged routes regardless of the stored preference. `/upgrade`'s pending-payment ⏳ now flips like a real hourglass (`hourglassFlip` keyframe). `/decks/new` tightened (padding/header/disclaimer sizing) to fit on screen without scrolling. **Animated every full-page loading state app-wide** — all 9 bare "Loading…" text-only screens (`/admin`, `/dashboard`, `/decks/[id]`, `/public/decks/[id]`, `/quiz/[deckId]` loading/starting/submitting phases, `/rewards`, `/settings`'s own loading state and its `Suspense` fallback, `/upgrade`) replaced with a new shared `src/components/ui/PageLoading.tsx` (spinner + message, reusing the existing `.spinner` CSS class) instead of static text. **Quiz page got a Pause/End quiz header (deck title + Question X of Y, matching the design concept) and smoother animations** — Pause saves progress to `sessionStorage` and auto-resumes on reopen; End quiz forfeits remaining questions as wrong via a shared `submitFinalResult()` helper; added a spring "pop" animation for correct-answer reveals and a per-question fade transition. **Dashboard deck cards gained a "⋮" Edit/Delete menu and a "Continue — Question X of Y" indicator** for paused quizzes, reading from a newly-shared `src/lib/quiz/pauseState.ts`. `npx tsc --noEmit` clean and the full 72-test suite green after the merge and every change. |
| v.11 | **Gizmo-reference fidelity pass: unified auth card + name/course/referral onboarding wizard.** Restored the Generation Mode card and animated the "Checking account…" loading state in `PdfUploadFlow.tsx`; fixed the same unresolved-Tailwind-class root cause across its remaining phases (root cause first found in v.10, this finished the sweep). Added header buttons + a Pro/Upgrade pill to `/decks/new`'s nav and fixed a real `maxWidth: 1024` nav-centering bug (content clumping mid-bar instead of sitting at the corners) on `/decks/new`, `/dashboard`, `/login`, `/signup`, `/`, `/forgot-password`, and `/settings`. Replaced the 5-option CSS-filter avatar "mood" picker with a real client-side profile-picture upload (`src/lib/theme/customAvatar.ts` — canvas square-crop, localStorage, frontend-only). Removed the `capy-idle.svg` nav-logo icon app-wide (verified zero remaining references). Replicated the concept's dashboard returning-user layout (smaller greeting, italic "Capy," removed a duplicate "Your decks" header) while keeping the stats row per standing precedent. Cropped ~55%-of-canvas transparent padding baked into `public/capy/capy-hero.png` (root cause of "too much spacing" below the image, via `sharp().trim()`), then removed the image from the login page entirely per a later explicit call; added `src/app/icon.png`/`apple-icon.png` (favicon/apple-touch-icon generated from `capy-hero.png`, solid cream background — accepted as-is); simplified `<title>` to "Crammable". Fixed a persistent login-page scrollbar via a `useEffect` forcing `document.documentElement`/`body` `overflow:hidden`. **Merged `/login` and `/signup` into one `AuthCard.tsx` component** with an in-place Sign up/Sign in pill toggle (`history.replaceState`, no remount — feels like one card, not two pages), restructured into a single floating card (logo + header + toggle + form + alt-options all inside one `bg-card` box, no separate nav bar) matching a competitor reference (Gizmo) while keeping our own theme colors; added disabled OAuth (Apple/Google) and phone-number placeholders (flagged for a backend session — needs Supabase OAuth provider config, a callback route, and an SMS gateway for phone auth); added a show/hide eye-icon toggle to all three password fields. **Trimmed signup to email/password/confirm/consent only** — full name, course, and referral code moved to a new one-question-at-a-time `/onboarding/name` → `/onboarding/course` → `/onboarding/referral` wizard that runs after email confirmation (gated by a `cm_pending_onboarding` localStorage flag checked on dashboard load). Reuses the existing `claim-profile-complete` and `referral/claim` endpoints as-is — **zero backend changes**; confirmed with Yujin that referral rewards stay referrer-only (not the person entering the code, despite the wizard's copy possibly reading that way at a glance). Added a floating to-do checklist on the dashboard (fixed to the right edge of the viewport) for any account — not just fresh signups — that never finished the name/course steps, with a "Finish now →" button that routes to whichever step is actually missing. `npx tsc --noEmit` clean and the full 72-test suite green throughout; committed + pushed to `origin/FrontEnd` (`42b8dc8`). |
| v.10 | **Applied the "Capy Calm" concept UI to Dashboard + Upload** (`ui-concept/v1/capy-lofi-concept.html`, sections 2+3 only this pass — co-devs' explicit ask). Added `CardCountOptions` (10/20/30) + `GenerateRequest.maxCards` to `contracts.ts`, clamped server-side in `/api/generate` against the user's tier max (silent fallback, same pattern as Deep Dive's downgrade). New localStorage-only nav avatar mood picker (`AvatarPicker.tsx` + `avatarMood.ts` — 5 CSS-filter "moods" over one real image, `public/capy/avatar-default.png`, the actual concept-supplied art, not a placeholder). Both navbars (`/dashboard`, `/decks/new`) gained a Pro badge + the avatar picker; nav logo restored to `public/capy/capy-hero.png` after a brief, corrected detour to text-only. Dashboard deck grid restyled to the concept's look — dashed "+ New deck" tile first, each deck card got an inline "Quiz me" button — while keeping the existing stats row (Capycoins/Active decks/Plan) the concept doesn't show, per explicit instruction not to remove existing features. Upload flow (`PdfUploadFlow.tsx`) reordered to dropzone → Deck Settings (deck name + card-count chips, `30` Pro-locked for free tier) → explicit Cancel/Generate flashcards buttons — picking a file no longer auto-starts extraction; generation now only fires on "Generate flashcards" click, matching the concept exactly. Typecheck + full 72-test suite green throughout. |
| v.08 | **Dark-mode bug fix + UI polish.** Fixed `/decks/new`'s upload card being nearly unreadable in dark mode — `PdfUploadFlow.tsx` never migrated off Tailwind `dark:` classes (see Known fixes); rewrote it fully onto the CSS-variable theme tokens and redesigned its Generation-mode picker as clickable radio-cards (was a native `<fieldset>`/`<legend>`) with a smooth `Upgrade to Pro` link/badge for non-Pro users instead of a disabled control. Fixed a real CSS bug where `hover-lift` silently stopped working on any card that also had a `fadeUp` entrance animation (see Known fixes — both were fighting over `transform`). Settings: nav now shows email instead of display name; "Sign out" relabeled "Log out of all devices" with explicit `scope: "global"`; added entrance animation + non-moving hover states (chip/btn-outline/btn-solid CSS classes) across Settings and the dashboard; dashboard's 👋 now does a single gentle wave on hover (not constant); Capycoin icons enlarged and now fill their containers edge-to-edge instead of floating with padding. Typecheck/build/72-test suite all green. *(A wrong-answer "teaching lesson" feature — a per-card `explanation` baked in at generation time, plus a `flashcards.explanation` schema column/RPC change and a new `/api/quiz/explain` route — was built, reverted (backend-owned files touched from a frontend session), then **re-implemented and shipped on 2026-06-21 with backend sign-off**; it is now live. See `docs/PROPOSAL_QUIZ_EXPLANATION.md`.)* |

---

## For Claude (Session Lifeline)

> **Current status (2026-06-22):** All app pages and backend routes the UI calls are
> built and wired. The prior session (Mom's PC) did a Gizmo-reference fidelity pass across
> nav sizing, the avatar picker, and the login/signup flow — the biggest change is that
> `/login` and `/signup` are now one shared `AuthCard.tsx` component (single floating
> card, in-place Sign up/Sign in toggle, disabled OAuth/phone placeholders), and signup
> itself was trimmed to email/password/consent with full name/course/referral moved to
> a new post-confirmation `/onboarding/*` wizard. That wizard reuses existing reward
> endpoints with **zero backend changes**. Apple/Google OAuth and phone-number auth are
> UI-only placeholders — turning them on for real needs a backend session (OAuth
> provider registration, Supabase Auth config, a callback route, an SMS gateway).
> Separately, on `main`, a wrong-answer AI "teaching lesson" feature — built once on
> `FrontEnd`, reverted because it touched backend-owned `contracts.ts`/`schema.sql`
> without sign-off — was **re-implemented by the backend dev and shipped 2026-06-21**:
> the `flashcards.explanation` column is live on Supabase, new cards bake in the
> explanation at generation time, and `POST /api/quiz/explain` (`ApiPaths.explainAnswer`)
> is the live on-demand fallback for older cards. This session merged that `main` work
> into `FrontEnd` and gave the quiz page's wrong-answer state a dedicated sidebar (CSS
> speech bubble + `teaching-capy.png`, background-removed) instead of the inline banner
> `main` shipped, wired to the real `explanation`/`explanationLoading` state — see the
> dated log below for the merge/sidebar details. The remaining concept sections
> (results ring, avatar showcase, the floating style-picker) are still explicitly out of
> scope. The flashcard study-mode section *was* picked up this same session, separately:
> `/decks/[id]`'s flip-card viewer now has real "✓ Got it" / "✗ Review again" self-report
> buttons wired to a new `POST /api/flashcards/[id]/review` route (reuses the previously-
> unused `apply_card_review()` RPC — no schema change). The app-wide chrome gap (404/error/
> loading pages, shared Navbar/Footer, admin nav link) from prior sessions is still open
> — see Pending below.
>
> **Update (2026-06-23, same session continued):** Now on v.14. Copied concept #4
> ("Generating — Capy is on it") onto `PdfUploadFlow.tsx`'s upload screen, and put the
> study-mode self-report buttons through several real rounds of feedback (Discord-style
> hover, repositioned, toned down, auto-advance + auto-reveal, an answered-status dot
> badge, the dot cap removed entirely) — see the dated log below for all of it, including
> two real bugs caught and fixed mid-session (auto-advance could strand you on the last
> card; the quiz page's question card was shrinking/sliding depending on answer state).
>
> **Update (2026-06-23, later same day):** Now on v.15. Concept sections **#7/#7b and #9
> are done** (see v.15 row in Version History above) — quiz results got the SVG score
> ring + Capy reaction bubble + perfect-score variant, and the avatar system got a real
> dedicated `/settings/avatar` page (real upload with a preview/confirm step, plus the
> concept's actual sticker-set art shown taped-shut as "coming soon"). Also shipped a new
> `/help` page (FAQ + `App.supportEmail`, now `crammablesupport@gmail.com`). Per Yujin's
> later final scoping call, **all 10 concept sections are now resolved** — #1/#8 decided
> not necessary (text-only record), #6/#10 confirmed already done/settled, #7/#7b/#9 done
> above. Also fixed the cramped missed-cards layout (numbered, stacked correct/your-answer
> blocks instead of inline label+text), anglicized the lowest-score reaction copy, fixed
> the deck-title caption ("HTML" → "HTML Quiz"), and ran down a real bug where
> `congrats-capy.png`/`teaching-capy.png` showed a white box in real browsers — root cause
> was `next/image`'s WebP conversion silently dropping the alpha channel; fixed by
> switching both to plain `<img>` tags (see the dated log below for the full debugging
> arc). **Just added a client-side "Share score" canvas card + share/download flow**
> (same v.15 row above) — no backend touched.
>
> **Update (2026-06-24): Now on v.16, pushed to `origin/FrontEnd` and PR'd to `main`.**
> Picked up exactly where v.15 left off (it was never pushed separately — this PR carries
> both). Avatar dropdown went from hover to click-toggle (touch devices don't have hover)
> with the user's email shown Gmail-style at the top. Spent real time on a recurring
> "Crammable" wordmark crowding complaint across several pages — landed on a **per-page
> decision** (remove / center / keep) based on each page's actual content, not one global
> rule; the dashboard case specifically went remove → restore after a screenshot was
> initially misread as iPhone XR when it was iPhone 14 Pro, which is the origin of the
> two-tier (`480px`/`390px`) nav breakpoint fix in the v.16 row above — that fix is what
> actually lets the wordmark stay on dashboard without clipping on a real narrow phone.
> Redesigned the quiz "Correct!" feedback from a layout-shifting banner into a small
> rotated stamp. **Hit the stale-Turbopack-cache bug a third time** — this occurrence
> proved a process kill + `npm run dev` restart isn't sufficient on its own, only
> `rm -rf .next` reliably forces a fresh compile; see Known Fixes, this is worth knowing
> before burning another round-trip on it. Everything in this update plus everything
> carried over from v.15 is now one PR — see the top of this file's Pages/API tables for
> current status, nothing else changed there this round.

**Last session: 2026-06-22 [Personal PC] — merged `main`'s live explanation feature, quiz wrong-answer sidebar, theming/animation polish**

### What happened
- **Merged `origin/main` (`1d5c002`) into `FrontEnd`** to pick up the backend dev's
  re-implementation of the wrong-answer "teaching lesson" feature (`flashcards.explanation`
  column live on Supabase, `POST /api/quiz/explain` fallback, new `contracts.ts` types).
  `contracts.ts` merged with zero conflicts (additive-only). `src/app/quiz/[deckId]/page.tsx`
  had one real conflict (the wrong-answer feedback-banner region) — resolved by keeping a
  correct-only banner and moving the wrong-answer UI into a new sidebar instead (below).
  This file (`FRONTEND.md`) had two documentation-only conflicts (Version History + this
  lifeline block) — reconciled so both sessions' work is represented instead of one
  overwriting the other.
- **Built a real quiz-page wrong-answer sidebar**, replacing `main`'s inline banner: a
  flex row layout (main question column + a `flex: "0 0 220px"` sidebar that only renders
  `hasAnswered && !isCorrect`). The sidebar's speech bubble is pure CSS (`.speech-bubble`
  class, `globals.css` — a rotated 16×16px square `::after` forms the tail) per explicit
  instruction to build the bubble in code, not use a pre-baked bubble-graphic asset. Wired
  to the real `explanation`/`explanationLoading` state from the merge (shows "Capy is
  thinking…" while loading, the real explanation once it resolves).
- **Removed `teaching-capy.png`'s baked-in white background — two passes.** First pass: it
  was colorType 2 (opaque RGB, no alpha) despite sitting on a themed card background. Used
  `sharp` to flood-fill background-removal seeded from all four image edges (white-threshold
  ≥235, BFS so only contiguous-from-edge white goes transparent), then resized/compressed
  (1.64MB → 74KB). Yujin then reported the white box was still showing in the live quiz
  sidebar — the art's sticker style has a *second* white ring drawn just inside a thin black
  outline stroke, optically identical to true background but not edge-connected to it, so
  the first pass's flood-fill stopped at that outline and left the ring opaque. Second pass:
  reran the BFS treating both white **and** near-black pixels as "passable" (white gets
  removed, black is left opaque but the fill tunnels through it to keep going), so it now
  eats through the outline into the ring and removes that too — verified via a red-highlight
  pixel diff against the first-pass file that the only newly-removed pixels are the thin ring,
  not the character's wand/glasses/vest/fur. Yujin still saw the white box after that second
  pass too — wrongly diagnosed in the moment as browser cache (told him to hard-refresh; it
  wasn't that). Real cause, found by curling the `/_next/image` endpoint directly with a
  Chrome-like `Accept` header: Next's dev-mode image optimizer has its own **on-disk** cache
  at `.next/dev/cache/images/` that a dev-server restart does *not* clear, and it was still
  serving a pre-fix WebP variant with alpha flattened to opaque white. Deleting that one
  subfolder (`rm -rf .next/dev/cache/images`) forced a fresh `MISS` re-encode with real alpha
  this time — confirmed via `curl` before telling Yujin to check again. Full writeup in
  Known Fixes below so this doesn't cost another round-trip next time a `public/` asset's
  bytes change in place.
- Added `public/capy/capy-reading.png` (capybara-reading-a-PDF art) via the same flood-fill
  technique, replacing the bare spinner in `PdfUploadFlow.tsx`'s uploading/generating phase
  with the image + a gentle CSS bob (`capy-reading-bob` keyframe) above the spinner+status text.
- **Fixed a real dark-mode bug:** dark mode is a localStorage device preference with no
  "log out" concept, so enabling it would leak onto public marketing/login/signup pages for
  the next person on that browser. `ThemeProvider.tsx` now force-applies light theme on
  `contracts.ts`'s `// Public`-tagged routes (`Routes.home/login/signup/forgotPassword`)
  regardless of the stored preference; `layout.tsx`'s anti-flash inline script does the same
  pathname check before paint so there's no flash of the wrong theme either.
- `AuthCard.tsx`: added a hover state (`.text-link` class) to the Sign up/Log in toggle
  link; the mode switch now crossfades (`anim-fade-up` keyed on `mode`) instead of jumping,
  and both modes align from the top instead of one being vertically centered and the other
  not; tightened signup spacing (referencing Gizmo) so it fits without scrolling.
- `/upgrade`'s pending-payment ⏳ now flips like a real hourglass (new `hourglassFlip`
  keyframe, 3s loop: hold → flip 180° → hold → flip back).
- `/decks/new` tightened (wrapper padding, header sizing, disclaimer sizing) to fit on
  screen without scrolling.
- **Animated every full-page "Loading…" screen app-wide.** All 9 were bare static text on
  a blank page (`/admin`, `/dashboard`, `/decks/[id]`, `/public/decks/[id]`, `/quiz/[deckId]`'s
  loading/starting/submitting phases, `/rewards`, `/settings`'s own loading state plus its
  `Suspense` fallback, `/upgrade`) — identical markup duplicated 9 times across 8 files, so
  pulled it into one shared `src/components/ui/PageLoading.tsx` (`{message}` prop, defaults
  to "Loading…") instead of patching each site individually. Reuses the existing `.spinner`
  CSS class (the same circular spinner already used in the upload flow's
  uploading/generating status block) rather than inventing a new animation.
- **Quiz page: deck title + Pause/End quiz, matching the design concept.** The concept
  mockup's quiz screen shows the deck/quiz title and an "End quiz" action that the real
  page never had (just a bare "X / Y" counter in the nav corner). Added a header row above
  the progress bar with `{deck.title} — Quiz` + "Question X of Y", plus two pill buttons.
  **Pause** saves the in-progress session (`sessionId`, `questions`, the next-unanswered
  index, `answers`, `quizType`) to `sessionStorage` keyed per deck and returns to the
  dashboard; reopening that deck's quiz auto-resumes exactly where they left off instead of
  restarting `setup`. **End quiz** is a deliberate forfeit, not a pause — confirms via
  `window.confirm()` (same pattern as the existing delete-deck button), then synthesizes an
  empty/wrong answer for every question that hasn't been answered yet (including the one on
  screen, if not yet checked) and submits the full set immediately, same as reaching the
  last question normally. Required pulling the submit-to-API logic out of `nextQuestion()`
  into a shared `submitFinalResult()` so both paths (normal finish, early end) go through
  one place. **Real bug caught before it shipped:** pausing right after answering a
  question but before clicking "Next" would, if resumed naively at the raw `currentIdx`,
  show that same question again as unanswered — answering it a second time would push a
  duplicate entry for that flashcard into the final submission. Fixed by deriving the resume
  index from `answers.length` (questions are answered strictly in order in this UI) instead
  of the raw `currentIdx`, both when saving and when restoring.
- **Smoother quiz animations.** Added a `pop` keyframe (`globals.css` — small spring-like
  overshoot, scale 0.85→1.05→1) for "this answer just got revealed as correct" moments:
  the green "Correct!" banner, the identification-mode correct-answer reveal box, and the
  highlighted-correct multiple-choice option. The question card (+ its options/input) is now
  keyed on `currentIdx` with the existing `anim-fade-up` class, so advancing to a new
  question fades it in instead of jump-cutting in place — re-answering the *same* question
  (the `hasAnswered` flip) does not remount it, only advancing does.
- **Dashboard deck cards: "⋮" menu (Edit/Delete) + paused-quiz resume indicator.**
  Extracted the quiz page's pause-state read/write/clear into a shared
  `src/lib/quiz/pauseState.ts` (was page-local) so the dashboard can read the same
  `sessionStorage` shape without duplicating it. Each deck card converted from one big
  `<Link>` to a `<div onClick>` (navigates to the deck detail page) so a kebab button and
  its dropdown can sit on top without nesting interactive elements — both stop propagation
  so clicking them doesn't also fire the card's own navigation. **Edit** links to the
  existing `/decks/[id]` page (rename + add/edit/delete card already live there — not
  rebuilt). **Delete** calls the same `DELETE /api/decks/[id]` the deck-detail page's
  existing delete button uses, behind the same `confirm()` prompt, then removes the deck
  from local state without a refetch. **Resume indicator:** if `readPausedQuiz(deck.id)`
  finds a paused session, the "Quiz me" pill becomes "Continue — Question X of Y" and
  links straight into `/quiz/[deckId]`, which auto-resumes from that pause-state shape.
  **Adjacent fix, not separately requested:** "Quiz me" previously linked to the deck
  detail page (it was just a styled `<span>` inside the card's outer `<Link>`, never its
  own link) — now a real `Link` to `/quiz/[deckId]`, matching its label. **Hover states**
  added for all three new interactive pieces (Yujin: "looks stale" without them) — new
  `globals.css` classes `.icon-btn` (kebab button) and `.menu-item`/`.menu-item-danger`
  (Edit/Delete rows), plus `.quiz-pill` (Quiz me/Continue — needs its own distinct hover
  beyond the card's shared `.hover-lift`, since hovering the pill otherwise looked
  identical to hovering anywhere else on the card: adds brightness + a box-shadow + a 1px
  lift on top of whatever the parent card is already doing). **First pass used
  `var(--bg-subtle)` for the tint and still looked stale** — in dark mode `--bg-subtle`
  (`#2C2A1E`) and `--bg-card` (`#252318`) are nearly the same lightness, so the "highlight"
  was real but practically invisible against the card it sits on. Swapped both to a solid
  `var(--primary)` background + `var(--on-primary)` text on hover (Delete uses
  `var(--error)` instead, via `.menu-item-danger:hover` ordered after `.menu-item:hover`
  in the stylesheet to win the cascade tie) — a real native-context-menu-style highlight
  bar instead of a barely-there tint, theme-independent since it no longer depends on two
  similarly-dark CSS variables differing enough to read as "changed." **Still didn't show
  up for the kebab button or the Continue pill — second, real root cause:** the kebab
  `<button>` and the pill `<Link>` both set their own colors via inline `style={{...}}`
  (e.g. `background: "transparent"`), and an inline style declaration always beats a
  plain class selector regardless of which one is hover-specific — the `.icon-btn:hover`/
  `.quiz-pill:hover` rules were computing correctly the whole time, just always losing to
  the element's own inline non-hover styles. Same root cause `.nav-link`/`.btn-outline`
  already work around with `!important` elsewhere in this file — added it here too. Label
  also changed from "Continue — Question X of Y" to "Continue: Question X of Y" per
  Yujin's preference.
- **Deck-detail page (`/decks/[id]`) — Continue vs. Redo, and a real Pro tooltip.**
  Same `readPausedQuiz(deckId)` read as the dashboard, now also wired into the deck
  detail page's two quiz entry points, which previously both just said "Start Quiz"
  unconditionally. The small pill near Export PDF/Delete deck (top) is the *resume*
  path — label flips to "Continue Quiz →" when a pause exists, same `/quiz/[deckId]`
  href either way since the quiz page's own resume logic does the rest. The big button
  under "Feeling ready? Test yourself on all N cards." (bottom) is the deliberate
  *restart* path — label flips to "🎯 Redo Quiz" and its `onClick` calls
  `clearPausedQuiz(deckId)` before the link navigates, so it can't accidentally resume
  the old attempt instead of starting over at question 1. Both pills got the `.quiz-pill`
  hover class for the same reason the dashboard's needed it (no hover at all otherwise).
  **Export PDF (Pro)** already had a native `title` tooltip (`UIMessages.proFeatureLocked`)
  but it's slow to appear and looks like plain OS chrome — added a styled `.tooltip-wrap`/
  `.tooltip-bubble` pair (new `globals.css` classes, same `:hover` reveal pattern as the
  nav avatar's `.avatar-wrap`/`.avatar-tooltip`) showing the same message instantly on
  hover; kept the native `title` too for accessibility.
- **`.quiz-pill`'s hover still wasn't visible — real fix this time.** Yujin reported the
  Continue/Redo Quiz buttons still had no noticeable hover after the `!important` fix.
  Root cause: `filter: brightness(1.15)` on a button whose background is already a
  saturated `var(--primary)` orange/gold barely shifts anything perceptible — same class
  of mistake as the earlier `var(--bg-subtle)`-too-close-to-`var(--bg-card)` bug, just
  with a filter instead of a color. `globals.css` already has a `--primary-hover` token
  defined *for exactly this* (`.text-link` documents the same lesson) — switched
  `.quiz-pill:hover` to swap `background: var(--primary-hover)` directly instead of
  filtering, keeping the box-shadow/lift. **Found and fixed a real pre-existing contrast
  bug while in the same lines:** both quiz buttons on `/decks/[id]` set their text color
  to `var(--nav-text)` (always light) instead of the theme-aware `var(--on-primary)` the
  dashboard's equivalent pill already used correctly — in dark mode that's light cream
  text on an already-bright gold background, and `--primary-hover` in dark mode is even
  *lighter* (`#FFC066`), so the new hover would have made an existing readability problem
  worse. Switched both to `var(--on-primary)` to match the dashboard's correct pattern.
- **Every remaining button on `/decks/[id]` had zero hover state** — confirmed by grep:
  only the nav's "← Back" had a class (`.nav-link`); per-card Edit/Delete, Study weak
  cards, + Add card, Make public/private, and Delete deck were all plain inline-styled
  elements with no hover at all. Wired all of them to the existing hover-class system
  rather than one-off styles: per-card Edit → `.text-link`; per-card Delete → new
  `.text-link-danger` (same idea as `.text-link`, hovers to `var(--error)` instead of
  `var(--primary-hover)`); Study weak cards / Make public ↔ private (both two-state
  toggles, solid-primary when active, neutral-outline when not) → conditional
  `.btn-solid`/`.btn-outline` matching whichever state is showing (also fixed the same
  `var(--nav-text)` → `var(--on-primary)` contrast issue on Make-public's solid state
  while in the line); + Add card → `.btn-outline`; Delete deck → new
  `.btn-outline-danger` (hovers to error red/error-bg instead of primary, so a delete
  button doesn't invite a click the same way a normal outline button does).
- **Bottom Redo Quiz button: icon + copy now match what it actually does.** 🎯 (a
  targeting/aiming icon, fine for a first attempt) made no sense relabeled "Redo Quiz" —
  swapped to 🔁 specifically for the `pausedQuiz` state, keeping 🎯 for the normal
  first-attempt "Start Quiz" state. The subtitle above it also doesn't name a card count
  anymore for the redo case ("Want a clean slate? This resets your progress and
  re-quizzes the whole deck from question 1.") — Yujin's call: a deck's card count can
  change after a quiz was paused (cards added/removed), so stating a specific number next
  to "redo" reads as a promise about what you'll get quizzed on, which may no longer be
  true by the time you click it. The normal "Start Quiz" subtitle still says
  `Test yourself on all {total} cards` — that one wasn't the complaint, total is read
  fresh on every render there so it's never stale anyway.
- **Nav display name on `/decks/[id]` looked "randomly placed"** — it was the one page
  in the app still rendering the user's first name as bare 13px faint-colored text with
  no avatar next to it; `/dashboard` and `/decks/new` both already pair the name with
  `<AvatarPicker />` (the circular profile-picture widget). Brought this page in line:
  added `<AvatarPicker />` next to the name and bumped the name itself to 15px/600 weight/
  `var(--nav-text)` (was 13px/400/`var(--text-faint)`) so it reads as an intentional part
  of the nav instead of an orphaned label with nothing visually anchoring it.
- **Explanation latency (10-30s) flagged by Yujin on old cards.** Root cause: cards
  generated before the `flashcards.explanation` column existed have no baked-in
  explanation, so every wrong answer on them hits the live `/api/quiz/explain` →
  DeepSeek round trip — that's the genuine cost of a real-time AI call, not a bug.
  The actual fix (writing the live result back into `flashcards.explanation` so a card
  only ever pays that cost once, system-wide) needs a DB write in a backend-owned route
  and was **not** done here per the standing `contracts.ts`/`schema.sql` boundary —
  flagging for a backend session instead. Frontend-only mitigation shipped in the
  meantime: a `sessionStorage` cache keyed by `flashcardId` in the quiz page, so if the
  same old card is hit again in the same browser tab (re-quiz, "study weak cards", a
  retake) the explanation is instant instead of waiting again. New cards going forward
  are unaffected — they already get the baked-in explanation instantly.
- Investigated a "where did my saved deck go?" report — queried Supabase directly
  (service-role key) to confirm ground truth rather than trusting the UI; resolved as a
  real zero-decks state for that account, not a rendering bug (no code change needed).
- `npx tsc --noEmit` clean and the full 72-test suite green after the merge and after
  every subsequent change.
- **Copied UI mockup #5 ("Flashcard — study mode") onto the real flip-card viewer —
  "✓ Got it" / "✗ Review again" self-report buttons on `/decks/[id]`.** Confirmed with
  Yujin via `AskUserQuestion` that this should be real backend persistence, not a visual
  stub. Backend: discovered `apply_card_review()` (schema §4.12) and its TS wrapper
  `applyCardReview()` already existed but were unused anywhere in the app — reused them
  instead of touching `schema.sql`. Added `getFlashcardById()` to
  `src/lib/db/flashcards.ts`, a new `POST /api/flashcards/[id]/review` route mirroring the
  sibling PATCH/DELETE route's CSRF/auth/rate-limit/RLS-404 pattern exactly, and (after
  confirming the `contracts.ts` boundary first, since this needed new entries there)
  `ReviewCardRequest`/`ReviewCardResult` + `ApiPaths.flashcardReview` +
  `RateLimits["/api/flashcards/[id]/review"]`. The server recomputes `difficulty_score`
  itself from the card's current value (same nudge formula `submit_quiz_result()` uses)
  rather than trusting a client-supplied score — self-reported review has no answer to
  grade against, unlike a quiz submission. Frontend: two new buttons rendered below the
  flip card, calling `submitCardReview(wasCorrect)` → updates the card's
  `difficulty_score` in local state on success. Styled with the theme's `--success`/
  `--error` token pairs (mirrors the mockup's moss/clay coloring) and given `!important`
  hover swaps (`.btn-review-correct`/`.btn-review-wrong` in `globals.css`) per this
  session's established hover-fix pattern, rather than risking the same
  invisible-hover bug hit three times earlier this session.
- `npx tsc --noEmit` clean and the full 72-test suite green after this change too.
- **Added a quiz sub-type default picker to `/decks/[id]`.** Yujin clicked through to the
  quiz page and never noticed the Multiple Choice/Identification/Mixed picker because it
  only lives on the quiz page's own setup screen — asked for it to also be reachable from
  the deck page. Confirmed via `AskUserQuestion`: deck page = `/decks/[id]` (not a
  separate "edit" page — there isn't one), and picking a type there should set a
  *default* the quiz page pre-selects (not skip its setup screen entirely). New
  `src/lib/quiz/defaultQuizType.ts` — `localStorage`, keyed per deck, deliberately not
  `pauseState.ts`'s `sessionStorage` pattern since a quiz-type preference should survive
  a closed tab, unlike a mid-quiz pause. Added a 3-chip row (`.chip`/`.chip-active`, same
  classes Settings' theme/font pickers use) to the bottom Quiz CTA section on
  `/decks/[id]`; the quiz page's `selectedType` useState now lazy-initializes from
  `readDefaultQuizType(deckId)` instead of always defaulting to Multiple Choice — still
  fully changeable on the setup screen before starting. `npx tsc --noEmit` clean and the
  full 72-test suite green.
- **Restyled "Got it"/"Review again" per feedback — Discord sidebar-style hover, no more
  doubled checkmark.** Yujin: the appended confirmation icon (label became "✓ Got it ✓"
  once clicked) looked bad, and asked for Discord's sidebar hover/highlight treatment
  instead (clarified via `AskUserQuestion` to specifically the background-fade mechanic,
  not the left indicator bar or the icon shape-morph Discord also does). Buttons now start
  as a plain outline (transparent background, colored border/text) and the background
  fades smoothly to a solid fill on hover — `transition: background/border-color/color`
  instead of the instant `!important` swap used elsewhere this session. A new `.is-active`
  class (added in JS once `lastReviewed` matches that card+outcome) reuses the exact same
  filled-in look so "you already reviewed this" is a persistent highlight, not extra text
  — the doubled-checkmark logic in the JSX was removed entirely, labels are now always
  plain "✓ Got it" / "✗ Review again". `npx tsc --noEmit` clean and the full 72-test suite
  green.
- **Added a third hover layer, then moved it from left edge to bottom edge, then toned
  the whole thing down — three rounds of feedback.** First pass approximated Discord's
  left-edge "pill" as a growing left accent bar; moved to a bottom-center growing bar
  per feedback; then a white-glow version of that bar plus the full-saturation
  `var(--success)`/`var(--error)` solid hover fill both got called out as "too bright...
  annoying" against dark mode's otherwise muted/warm palette — explicitly including the
  red/green fill colors themselves, not just the new bar. Reworked both pieces to match
  dark mode's own existing register instead: hover/active background is now
  `var(--success-bg)`/`var(--error-bg)` (the same muted tinted-surface tokens the theme
  already defines, instead of a fully saturated solid fill), text color no longer swaps
  to `var(--on-primary)` (stays the same muted `--success-dark`/`--error-dark` in both
  states), and the bottom bar dropped the white glow entirely in favor of the matching
  `var(--success)`/`var(--error)` border color at 0.8 opacity — an accent within the
  theme's own palette rather than a separate bright white highlight.
- **The toned-down styling above didn't show up at all after a hard refresh** — turned
  out to be a real bug, not a "still too bright" judgment call: Turbopack's dev server
  was serving a stale compiled CSS chunk, confirmed by `curl`-ing the chunk directly and
  finding the *original* (pre-tonedown) rule bodies still present after both a hard
  browser refresh and a full dev-server kill+restart. Root cause was the persistent
  on-disk `.next/dev/cache/turbopack/` cache (same cache-survives-restart pattern as the
  `.next/dev/cache/images` bug found earlier this session, different subfolder). Killed
  the dev server, `rm -rf .next/dev/cache/turbopack`, restarted, and verified via another
  direct `curl` of the compiled chunk that the new rule bodies were actually present
  before asking for another visual check. Full writeup in Known Fixes below.
- **Final UX pass on study mode, two small requests.** Relocated and reworded the
  "Click card to flip" hint — it lived in the top header row (next to Edit/Delete) and
  never mentioned what flipping actually does; moved it to sit between the flip card and
  the Got it/Review again buttons (per a reference screenshot), and made it state-aware:
  "Click card to view answer" before flipping, "Click card to flip back" after.
  **Got it/Review again now auto-advance to the next card** on success instead of
  requiring a separate manual click on the → arrow — `submitCardReview()` calls the
  existing `goTo(Math.min(total - 1, currentIdx + 1))` right after recording the review,
  same clamp-at-the-end behavior the arrow button already had.
- The full feature (self-report buttons, the quiz-type picker, and this session's hover
  iteration) was actually clicked through and confirmed working in a real browser this
  time — the dev server's request log shows a string of real
  `POST /api/flashcards/[id]/review` calls returning 200 across several different card
  ids while Yujin was testing.
- **Fixed a real layout bug on the quiz page: a large dead gap on the right side of wide
  screens — took three passes to land on a fix that actually doesn't move the card.**
  Found while Yujin was testing the quiz itself (separate from the study-mode work above).
  `/quiz/[deckId]`'s quizzing-phase content sat in a `maxWidth: 940` container, with the
  main question column and the wrong-answer sidebar as flex siblings in one row — the main
  column was hardcoded to `maxWidth: 680` *unconditionally*, even though the 220px sidebar
  only renders when `hasAnswered && !isCorrect`. Every other state left up to 260px of the
  already-allocated 940px container empty to the right of the card.
  **Pass 1:** made the cap conditional (`680` only when the sidebar shows, else `940`) —
  Yujin caught that this just relocated the problem: the card now visibly *shrank* every
  time a wrong answer appeared ("unnecessary minimization... and randomly too").
  **Pass 2:** kept the main column at a constant `maxWidth: 940` and instead widened the
  *outer* container conditionally (940 → 1200) so the sidebar could fit beside it without
  forcing a shrink. Width stopped changing, but Yujin immediately caught a *second*,
  subtler bug: widening a `margin: "0 auto"`-centered box shifts where its centered left
  edge lands, so the same-width card still visibly slid ~100px sideways between states
  ("You are still moving it") — confirmed by comparing the two screenshots' card left
  edges, not just their widths.
  **Pass 3 (final):** stopped trying to share layout space with the sidebar at all. Outer
  container is back to a flat constant `940` always. The question-column wrapper is now
  `position: relative` with no flex-row sibling; the sidebar is `position: absolute,
  left: "100%", marginLeft: 24` — entirely out of normal flow, anchored to the main
  column's own right edge and rendered in the page's outer margin (the actual empty space
  Yujin circled in a follow-up screenshot), so it can structurally never affect the main
  column's width *or* position, regardless of which state is showing.

### Pending (as of 2026-06-23, Personal PC)
- **All 10 concept sections from `ui-concept/v1/capy-lofi-concept.html` are now resolved**
  — closing out the "copy mockup #N onto the real page" thread that ran across v.10–v.15:
  - **#1 (empty state) and #8 (Capycoin showcase) — DECIDED NOT NECESSARY** (Yujin,
    2026-06-23). Both are static/explainer mockup sections with no real functional gap
    behind them — the dashboard's zero-deck state already works, and the coin icon +
    balance already appear in the nav pill and the upload screen's footer (v.14). No code
    change; this entry is the record of the decision, not a TODO.
  - **#6 (quiz-taking screen) and #10 (live style picker) — DONE/settled** (Yujin,
    2026-06-23). #6: the live quiz page's existing functionality (pause/resume header,
    progress bar, wrong-answer sidebar, pop animations, built across v.12/v.13/this
    session's layout fix) is confirmed close enough — no further fidelity pass needed.
    #10 stays out of scope (concept-demo tooling, never a real feature to begin with).
  - **#7, #7b, #9 — DONE**, the only sections that needed real engineering this round (see
    v.15 row above). Committed and pushed as part of v.16, alongside everything else dated
    2026-06-24 below — see top of "For Claude" lifeline block.
- **FIXED:** `public/capy/congrats-capy.png` and `public/capy/avatar-default.png` had the
  same baked-in white background (no alpha) as `teaching-capy.png` had — same flood-fill-
  from-edges `sharp` technique applied, resized to 400px, both now genuinely transparent.
  1.9MB → 236KB and 1.7MB → 194KB respectively. **Side note, real finding:**
  `avatar-default.png`'s EXIF/XMP metadata contained Canva export info including a
  `pdf:Author` field with Yujin's real name — leaked into a file already committed and
  pushed to the shared `origin/FrontEnd` remote (commit `89b89fd`) that co-devs can read.
  The re-encode strips all EXIF/XMP (confirmed `hasExif: false, hasXmp: false` on the new
  file), so it won't carry forward — but the **old commit still has the original file with
  the metadata intact** in git history. Flagged to Yujin; no history rewrite attempted
  (rewriting a shared branch's history needs explicit sign-off, not assumed).
- **Backend work needed: shareable quiz results.** Yujin decided the result page's "share
  score" feature should be a real per-result link (not just a generic homepage redirect +
  downloadable PNG, which is what got built first and now stays as a secondary "download
  score card" option). The frontend UI is built and ready — wired against an API shape
  that **does not exist on the backend yet**. This mirrors the existing deck-sharing
  feature (`decks.is_public` + `/api/decks/[id]/share` + `/api/public/decks/[id]` +
  `/public/decks/[id]`) almost exactly; co-devs should copy that pattern, not invent a new
  one. What's missing, concretely:
  - **Schema:** `quiz_sessions.is_public BOOLEAN NOT NULL DEFAULT false` (new migration).
  - **RLS:** a new SELECT policy on `quiz_sessions`, `USING (is_public = true)` — same
    shape as the existing "decks: anyone read public" policy (`schema.sql` §5, ~line 1659).
  - **`POST`/`DELETE /api/quiz/[sessionId]/share`** — toggles `is_public` on a session the
    caller owns (RLS already scopes the write via `auth.uid() = user_id`, same as
    `setDeckPublic()` in `src/lib/db/decks.ts`). Response shape is already in
    `contracts.ts`: `ShareQuizResultResult { isPublic: boolean }`.
  - **`GET /api/public/results/[sessionId]`** — anonymous read, gated on `is_public = true`.
    **Must project only safe fields** — no `user_id`, no `quiz_answers` (a public result
    page should never leak which specific questions someone missed). Response shape is
    already in `contracts.ts`: `PublicQuizResult { deckTitle, scorePercent, correctCount,
    totalQuestions, completedAt }` — `deckTitle` needs a join to `decks.title` (safe to
    expose even if the deck itself is private — it's just a label, same as the existing
    `listQuizSessionsForUser()` join in `src/lib/db/quiz.ts`).
  - Frontend pieces already done and waiting on the above: `QuizResultData.sessionId` now
    flows from `submitFinalResult()` through to the result page; the result page has a
    "Share this result" / "Make public" toggle card (mirrors the deck-share card exactly,
    `toggleResultShare()`/`copyResultLink()`) that calls `Routes.api.quizResultShare()`;
    and a new public page at `/results/[sessionId]` (`src/app/results/[sessionId]/page.tsx`)
    that fetches `ApiPaths.publicResult()` and renders a read-only score showcase + signup
    CTA, mirroring `/public/decks/[id]/page.tsx`. Right now every one of these correctly
    shows its error/not-found state, since the backend route 404s — that's expected, not a
    bug, until the above lands.
  - **Not implemented and not asked for:** no referral-credit incentive for sharing a
    result (decks get +Capycoins for sharing — flagged as a possible future parallel, not
    built since Yujin didn't ask for it here).
- **Mobile/tablet responsiveness pass on every page's nav bar.** Yujin tested via Chrome's
  device toolbar (iPhone XR, 414px) and found the deck page's nav clipping the username and
  avatar off-screen — the right-side cluster (Capycoin pill + name + avatar) had no
  wrap/shrink behavior in a `display:flex, justifyContent:space-between` row with a fixed
  `height: 64`. Same nav shape is duplicated inline across every page (no shared Navbar
  component yet — known gap), so this was systemic, not a one-page bug. Fixed everywhere
  it appears (15 files: `dashboard`, `decks/[id]`, `decks/new`, `rewards`, `upgrade`,
  `settings` (both its navs), `settings/avatar`, `admin`, the homepage, `forgot-password`,
  `help`, `public/decks/[id]`, `quiz/[deckId]`, `quiz/[deckId]/result`,
  `results/[sessionId]`) with two new shared `globals.css` classes: `.nav-row` (flex-wrap +
  row-gap on the outer row, `height: 64` → `minHeight: 64` so wrapped content isn't
  clipped) and `.nav-cluster` (flex-wrap on the right-side item group). A `.nav-collapse`
  class + `@media (max-width: 480px)` query hides the lowest-priority text first (the word
  "Capycoins" — the number+icon stays, dashboard's email address, the first-name label on
  the deck page) so what's left stays compact instead of wrapping into a cluttered 3-line
  mess. This is computed live by the browser at any viewport width — phone, tablet,
  desktop — not a fixed rule tuned for one device size. No hamburger menu / nav redesign
  built — out of scope for what was asked (stop content from clipping off-screen), not a
  missing feature.
- **Default theme/font flipped to dark + Baskerville**, relayed by Yujin from co-dev
  Christian ("yun talaga pinaka gusto nila"). Changed both halves that have to agree or a
  first-time visitor flashes the old defaults for one frame: `ThemeProvider.tsx`'s
  `useState<ThemeMode>("light")` → `"dark"` and `useState<FontPairKey>("lora")` →
  `"baskerville"`, **and** `layout.tsx`'s anti-flash inline script, which previously only
  forced dark/a font pair when localStorage explicitly had one saved — now falls back to
  `"dark"` / `"baskerville"` when nothing's stored yet, so brand-new visitors land directly
  on the real default instead of light/Lora-then-flip. Public/pre-login pages (home, login,
  signup, forgot-password) are unchanged — still forced light regardless, per the existing
  documented reason (a shared-browser dark-mode leak onto the next visitor's auth pages).
  Anyone who already explicitly picked light/a different font in Settings keeps their
  choice (only the *default* for new/never-chosen users changed). No schema/contracts.ts
  change — this is pure `ThemeProvider`/`layout.tsx` state, `tsc`/lint/72-test suite all
  green. Added `"(default)"` labels to the Dark/Baskerville chips in Settings' Appearance
  picker per Yujin's follow-up, so the picker itself shows which option is now the default.
- **Nav avatar circle recentered + enlarged.** `public/capy/avatar-default.png` had the
  same kind of off-center content as `congrats-capy.png` earlier this session (73px top
  margin vs. 55px bottom, ~4.5% vertical offset within its own 400×400 canvas) — re-cropped
  and re-centered the same way (now 64/64 top-bottom, 41/40 left-right). `AvatarPicker.tsx`'s
  circle bumped 32px → 40px.
- **Settings + Log out moved into the avatar dropdown** (Gmail-style account-menu pattern,
  Yujin's reference screenshot) instead of sitting as separate persistent nav-bar links/
  buttons. `AvatarPicker.tsx` now owns `handleLogout` directly (`getSupabaseBrowserClient().
  auth.signOut()` + redirect to `Routes.home`) and renders a "Settings" link + "Log out"
  button below "Change profile picture" in its existing hover tooltip — previously
  `handleLogout` only existed in `dashboard.tsx`, so `decks/[id]` and `decks/new` had **no
  way to sign out at all** without navigating back to the dashboard first; this fixes that
  for every page that renders `<AvatarPicker />`, not just dashboard. Removed the
  now-duplicate "Settings" link + "Log out" button (and the dead `handleLogout` function)
  from `dashboard.tsx`'s nav, and the duplicate "Settings" link from `decks/new.tsx`'s nav
  — also directly helps the mobile nav-wrapping fix from earlier today, since it's two
  fewer items competing for space in the main row. Left `profile.email` in dashboard's nav
  as-is (still hidden under 480px via `.nav-collapse`) — wasn't asked to move it, only
  Settings/Log out were.
- Carries forward everything still open from the v.11 entry below (OAuth/phone backend
  work, app-wide chrome gap).

### Pending (as of 2026-06-24, Personal PC) — what's actually still open for backend
> **Update (v.17):** most of the items below were closed in the v.17 push (see the
> v.17 Version History row). ✅ **shareable quiz results** — shipped (column + RPC +
> two routes). ✅ **app-wide chrome gaps** — `error.tsx`/`not-found.tsx`/`loading.tsx`
> added and a shared `<Navbar>`/`<Footer>` now replaces the per-page inline nav. ✅
> **theme sync** — now persisted to the profile, follows the user across devices.
> Still genuinely open after v.17:
- **OAuth (Apple/Google) + phone-number auth** are still UI-only placeholders on the
  login/signup card (carried forward from v.11) — needs Supabase OAuth provider config, a
  callback route, and an SMS gateway before they can go live.
- **Admin nav link** — still intentionally absent (reachable only by typing the URL);
  kept that way by request as security-by-obscurity, not an oversight.
- **`/api/quiz/explain` latency on old cards** (10-30s per wrong answer, no DB write-back) —
  flagged in Notes for Teammates below, still open as of this entry.

---

**Last session (historical): 2026-06-22 [Mom's PC → switching to Personal PC] — Gizmo-reference fidelity pass: unified auth card + onboarding wizard**

### What happened
- Continued the standing Capy Calm fidelity pass: restored the Generation Mode card,
  animated the "Checking account…" loading state, and finished the unresolved-Tailwind
  sweep across the rest of `PdfUploadFlow.tsx`'s phases (root cause first found in the
  prior v.10 session). Added header buttons + a Pro/Upgrade pill to `/decks/new`'s nav.
- **Real bug found and fixed: nav-centering regression.** Several pages had
  `maxWidth: 1024` (not `"100%"`) on the nav's inner wrapper, clumping the logo and
  right-side links together in the middle of wide screens instead of sitting at the
  corners. Fixed on `/decks/new`, `/dashboard`, `/login`, `/signup`, `/`,
  `/forgot-password`, and `/settings`. A detour to *constrain* the nav to match the
  content column instead was tried first, looked worse (full-width dark bar with a
  centered island and empty voids either side), and was reverted — confirmed with
  Yujin to keep full-width nav rather than box the whole page like a literal app-shell.
- Replaced the 5-option CSS-filter avatar "mood" picker with a real client-side
  profile-picture upload (`src/lib/theme/customAvatar.ts` — canvas-based square crop,
  localStorage only, no backend touched per the standing boundary rule). Removed the
  `capy-idle.svg` nav-logo icon entirely from the app (verified via grep: zero
  remaining references across all 13 pages that had it).
- Replicated the concept's dashboard returning-user layout (smaller, lighter greeting;
  italic "Capy" in the subtitle; removed a redundant "Your decks" header + duplicate
  "+ New deck" button) — kept the 3-card stats row per the existing standing precedent
  that real functionality doesn't get cut just because a static concept mockup didn't
  model it.
- **Root-caused the login hero image's "too much spacing" complaint** after several
  rounds of pure-CSS resizing didn't fix it: the source `public/capy/capy-hero.png` had
  ~55%-of-canvas transparent padding baked in (`sharp(src).trim()` revealed a
  368×279 visible bounding box inside a 408×612 canvas). Cropped the file itself
  (now the canonical asset). Later in the same session, on a literal "remove the image
  completely" instruction, it came back out of the login page again.
- Generated `src/app/icon.png` + `apple-icon.png` (Next.js auto-icon convention) from
  `capy-hero.png` via `sharp`, after Yujin asked for a Gizmo-style branded tab icon.
  Landed on a solid cream `flatten()` background after a transparent-corners version
  looked "cropped" on extreme zoom; Yujin said the solid version "does not look good"
  but then **rejected** a revert-to-transparent attempt with "actually I think this is
  okay for now" — that is the accepted final state, don't re-litigate without him
  raising it again. `<title>` simplified `"Crammable — Turn any document into a
  flashcard deck"` → `"Crammable"`.
- Fixed a persistent login-page scrollbar — took three escalating attempts (tightening
  spacing, then `height:100vh + overflow:hidden` on `<main>`, then finally a
  `useEffect` directly forcing `document.documentElement`/`body` `overflow:hidden` on
  mount with cleanup on unmount) before Yujin confirmed "Good now."
- **Merged `/login` + `/signup` into one `src/components/auth/AuthCard.tsx`.** Yujin
  compared the app against a competitor (Gizmo) and asked to replicate its single-card
  format: logo, header, an in-place Sign up/Sign in pill toggle, form, divider, and
  alt-options all live inside one floating card with no separate nav bar (kept our own
  theme colors, not Gizmo's literal white). The toggle swaps form fields via local
  state + `history.replaceState` rather than navigating — no remount, feels like one
  card morphing, not two pages. Added disabled Apple/Google + phone-number (`+63`
  selector) placeholders, explicitly flagged in code comments as needing a backend
  session. Added a show/hide eye-icon toggle to all three password fields (login,
  signup password, signup confirm).
- **Trimmed signup to email/password/confirm/consent.** Full name, course, and referral
  code moved to a new one-question-at-a-time wizard (`/onboarding/name` →
  `/onboarding/course` → `/onboarding/referral`) that runs after email confirmation —
  the dashboard checks a `cm_pending_onboarding` localStorage flag + incomplete profile
  and redirects there instead of rendering. Before building this, confirmed the
  existing `claim-profile-complete` and `referral/claim` endpoints already supported
  exactly this (full_name/course already optional/nullable, no schema change needed) —
  **zero backend changes**. Yujin double-checked the referral reward direction
  ("isn't it the opposite?") — confirmed current behavior (referrer-only, not the
  person entering the code) is correct as designed, no change made.
- Added a profile-completion nudge on the dashboard for **any** account (not just fresh
  signups) that never finished the name/course steps — iterated 3 times off Yujin's
  feedback: small nav pill → "close but not what I envisioned" (he circled a spot on
  the right edge of the viewport) → a vertical rotated-text tab → "I want it lengthwise
  … like how a to-do list works" → final version: a horizontal-reading floating card
  fixed to the right edge with a real checklist (☐/✓ Full name, ☐/✓ Course/Program,
  struck through once filled in) and a "Finish now →" button that seeds localStorage so
  it routes straight to whichever step is actually missing.
- `App.version` bumped `v.10` → `v.11`. Typecheck clean, full 72-test suite green
  throughout. Committed (`42b8dc8`, 27 files) and pushed to `origin/FrontEnd`.

### Pending (as of 2026-06-22)
- **Backend session needed:** Apple/Google OAuth (provider registration + Supabase
  Auth config + a new `/auth/callback`-style route) and phone-number auth (Supabase
  phone provider + a paid SMS gateway like Twilio) — both are disabled UI placeholders
  on `/login`/`/signup` right now, styling-only.
- Remaining concept sections (generating screen, flashcard study, quiz, results ring,
  avatar showcase, floating style-picker) still explicitly out of scope.
- App-wide chrome gap — unchanged, still open, carried from prior sessions.

---

**Previous session: 2026-06-21 [Personal PC] — Capy Calm concept UI: Dashboard + Upload**

### What happened
- Added `CardCountOptions` (10/20/30) to `contracts.ts` + `GenerateRequest.maxCards`,
  clamped server-side in `/api/generate/route.ts` against the user's tier max (invalid/
  oversized values silently fall back, same pattern as the existing Deep Dive downgrade).
- New nav avatar picker (`src/components/nav/AvatarPicker.tsx` + `src/lib/theme/
  avatarMood.ts`) — localStorage-only, 5 "moods" via CSS `filter` over one real image
  (`public/capy/avatar-default.png`, the concept's actual supplied art). Added to both
  `/dashboard` and `/decks/new` navbars alongside a Pro badge (only `/dashboard` had
  one before).
- Nav logo: briefly went text-only, then restored to the concept's actual logo art
  (`public/capy/capy-hero.png`) once Yujin clarified that was the intended asset, not a
  removal — see Known fixes.
- Dashboard deck grid restyled toward the concept's look — a dashed "+ New deck" tile
  is now the first grid item, and each deck card has an inline "Quiz me" button — while
  deliberately **keeping** the existing stats row (Capycoins remaining / Active decks /
  Plan) that the concept doesn't show, per Yujin's explicit "don't remove any feature
  we already have."
- Upload flow (`src/components/upload/PdfUploadFlow.tsx`) restructured to match the
  concept's exact layout/behavior: dropzone (now shows the picked filename instead of
  auto-starting), then a "Deck Settings" card (deck name + 10/20/30 card-count chips,
  `30` Pro-locked for free tier, label-left row layout), then explicit Cancel/Generate
  flashcards buttons at the bottom. Generation now only fires on the Generate click —
  this is a deliberate behavior change from every prior session's one-shot
  pick-file→auto-extract→auto-generate flow, confirmed with Yujin first since it
  reverses an earlier explicit design call in this same session's plan.
- `App.version` bumped `v.09` → `v.10`. Typecheck clean, full 72-test suite green.
  Committed (`89b89fd`) and pushed to `origin/FrontEnd`.

### Known fixes (added this session — see table below for the permanent entries)
- Nav logo confusion: first removed the capybara icon next to "Crammable" entirely
  (mis-read "why this old logo, use the standard default one" as "go text-only," based
  on the concept HTML's `<div class="logo">Crammable</div>` markup having no icon).
  Yujin then supplied the actual intended files directly (`Chosen selection.png` for
  the avatar, `capy-hero.png` for the nav logo) — both copied into `public/capy/` and
  wired in. Lesson: when a concept HTML and a user's stated intent disagree, the user's
  literal asset takes priority over what the static mockup happens to show.

### Pending (as of 2026-06-21)
- Remaining concept sections (1, 4–10) are explicitly out of scope for this pass —
  generating screen, flashcard flip-study mode, quiz sidebar, results ring, avatar
  showcase section, and the floating live style-picker (concept-demo tooling, not a
  real Settings replacement).
- App-wide chrome — unchanged, still open (see below, carried from prior sessions).

---

**Last session (historical): 2026-06-18 → 2026-06-20 ~10:10PM [Personal PC] — ~2-day session**

### What happened
- Added a "Preferred style" section to `/settings` — dark mode, font-size adjuster,
  5-pairing font picker — backed by a new `ThemeProvider` (localStorage-only, live
  preview + explicit Save). See `src/lib/theme/ThemeProvider.tsx`.
- Fixed header/nav alignment (full-width, corner-anchored) and gave the active page's
  own nav label a bold/colored state; added a `.nav-link` hover class and applied it to
  every header nav link/button across all pages.
- Removed the export-my-data feature entirely (route, db function, tests, UI).
- Added a hover-lift / button-press / fade-up animation system (fade-up explicitly
  overrides `prefers-reduced-motion` — product decision, not an accessibility oversight).
- Renamed all user-facing "credits" copy to "Capycoins" (display text only).
- Added 3 new Capy character images wired into the quiz wrong-answer banner, the
  perfect-score result, and every Capycoin balance display.
- `App.version` bumped `v.06` → `v.07` partway through, then `v.07` → `v.08` for the
  second half below.
- **Fixed `/decks/new`'s dark-mode contrast bug** — `PdfUploadFlow.tsx` had never been
  migrated off Tailwind `dark:` classes, so its text was nearly unreadable in dark mode.
  Rewrote the whole component onto the CSS-variable theme tokens and redesigned its
  Generation-mode picker as clickable radio-cards instead of a native
  `<fieldset>`/`<legend>` (see Known fixes for both).
- **Built, then reverted same session: wrong-answer "teaching lesson."** DeepSeek
  generated a per-card `explanation` at deck-generation time (free, baked in), with a
  live on-demand `POST /api/quiz/explain` fallback for older cards. This touched
  `contracts.ts` (new `ApiPaths`/`RateLimits`/interfaces) and `schema.sql` (new
  `flashcards.explanation` column + both insert RPCs) — files the project's doc-ownership
  boundary marks backend-owned, never edited by the frontend session. Caught before the
  schema change was ever applied to the live Supabase project. **Reverted in full**
  (contracts.ts, schema.sql, generate-cards.ts, the new `/api/quiz/explain` route,
  `db/decks.ts`, `db/flashcards.ts`, the quiz page's explanation UI/fetch logic, and the
  two test fixtures that had picked up the new required field) — confirmed clean via
  `tsc --noEmit` and the full 72-test suite. The quiz wrong-answer banner UI fix from
  earlier in the session (neutral styling, single box, Capy art) was **not** reverted —
  that part never touched backend files.
  **Update (2026-06-21): re-implemented and shipped** with backend sign-off — the
  `flashcards.explanation` migration is now applied to the live Supabase project, both insert
  RPCs carry the field, new cards bake in the explanation, `POST /api/quiz/explain` is the
  live fallback, and the quiz page renders Capy's "why" paragraph. See
  `docs/PROPOSAL_QUIZ_EXPLANATION.md` §5 for the as-shipped notes.
- Fixed a real CSS bug: `hover-lift` silently stopped working on any element that also
  had a `fadeUp` entrance animation — both were fighting over `transform` (see Known
  fixes).
- Settings/dashboard polish: nav shows email instead of display name; "Sign out" →
  "Log out of all devices" (explicit `scope: "global"`); entrance animations + smoother
  non-moving hover states (`.chip`, `.btn-outline`, `.btn-solid` in `globals.css`)
  across Settings; dashboard's 👋 only waves on hover now (was constant/distracting);
  Capycoin icons enlarged and now fill their containers edge-to-edge.
- Hit and fixed three more real bugs earlier in the session — Turbopack cache
  corruption from clearing `.next` on a live dev server, a font picker that highlighted
  but didn't apply (CSS var double-indirection), and animations that didn't play at all
  (`prefers-reduced-motion` blocking everything) — all documented under Known fixes.

### Pending (as of 2026-06-20)
- **App-wide chrome** — no `not-found.tsx` / `error.tsx` / `loading.tsx`; no shared
  `<Navbar>`/`<Footer>` (re-implemented inline per page, now with the same `.nav-link`
  hover treatment but still duplicated, not extracted); no admin nav link gated on
  `is_admin`. See `docs/BASIC_UI.md §3`.
- Theme/font preference is localStorage-only (per-device) — not synced to the profile
  row, so it doesn't follow a user across devices. Flagged, not yet decided whether
  that's in scope.

**Last session (historical): 2026-06-12**

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
