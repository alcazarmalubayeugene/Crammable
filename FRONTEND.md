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
| `/dashboard` | `src/app/dashboard/page.tsx` | ✅ Done | User dashboard — credits, plan, deck list |
| `/decks/new` | `src/app/decks/new/page.tsx` | ✅ Done | PDF upload → AI generation flow (PdfUploadFlow) |
| `/decks/[id]` | `src/app/decks/[id]/page.tsx` | ✅ Done | Deck detail — flip-card viewer, quiz CTA |
| `/quiz/[deckId]` | `src/app/quiz/[deckId]/page.tsx` | ✅ Done | Quiz session — MC / Identification / Mixed |
| `/quiz/[deckId]/result` | `src/app/quiz/[deckId]/result/page.tsx` | ✅ Done | Score, missed-card review, retry/back actions |
| `/upgrade` | `src/app/upgrade/page.tsx` | ✅ Done | GCash manual payment — 13-digit ref number form |
| `/rewards` | `src/app/rewards/page.tsx` | ✅ Done | Referral code, ways to earn, claim code, history |
| `/settings` | `src/app/settings/page.tsx` | ✅ Done | Edit name/course, account info, sign out |
| `/admin` | `src/app/admin/page.tsx` | ✅ Done | Admin-only — approve/reject GCash payments |

---

## API Routes the Frontend Calls

All paths come from `ApiPaths` in `contracts.ts`. The frontend calls these via
`fetch()` — the backend team owns the implementation. Routes marked ⚠️ are not
yet implemented by the backend; the UI will show an error gracefully until they are.

| Endpoint | Method | Used by page | Backend status |
|---|---|---|---|
| `/api/upload` | POST | `/decks/new` | ✅ Implemented |
| `/api/generate` | POST | `/decks/new` | ✅ Implemented (test mode) |
| `/api/decks` | GET | `/dashboard` | ⚠️ Not yet — reads Supabase directly |
| `/api/decks/[id]` | GET | `/decks/[id]` | ⚠️ Not yet — reads Supabase directly |
| `/api/quiz/[id]` | POST | `/quiz/[deckId]` | ⚠️ Not yet — questions generated client-side |
| `/api/quiz/result` | POST | `/quiz/[deckId]` | ⚠️ Not yet — results stored in sessionStorage |
| `/api/referral/claim` | POST | `/rewards` | ⚠️ Not yet |
| `/api/payment/submit` | POST | `/upgrade` | ⚠️ Not yet |
| `/api/admin/payments` | GET | `/admin` | ⚠️ Not yet |
| `/api/admin/payments/approve` | POST | `/admin` | ⚠️ Not yet |
| `/api/admin/payments/reject` | POST | `/admin` | ⚠️ Not yet |

> **Note for teammates:** When you implement a route, remove the ⚠️ above and
> update the corresponding page if it was reading from Supabase directly as a workaround.

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

---

## For Claude

**Session date:** 2026-06-03
**Branch:** FrontEnd | **Version:** v.02 (no bump this session — fixes only)

### What we did this session
- Read and loaded `schema.sql`, `contracts.ts`, `CLAUDE.md`, `AGENTS.md`, `FRONTEND.md` as reference context. Always load these four at the start of every session.
- Reviewed the full schema and identified frontend-relevant concerns.
- Found and fixed a 3-part signup bug (see Bug Fix Documentation section for full details).
- Moved version badge from bottom-left to bottom-right (was overlapped by browser avatar button).
- Tested locally — dashboard loads, badge visible, signup flow confirmed working.

### Files changed
| File | What changed |
|---|---|
| `src/app/signup/page.tsx` | Fixed typo `consentDeeseek` → `consentDeepseek`; added `course` to the fetch body |
| `src/app/api/auth/signup/route.ts` | Fixed typo in schema + comment; added `course` to Zod schema; destructured and passed `full_name`, `course`, `consent_deepseek` into Supabase auth `user_metadata` |
| `src/app/api/auth/callback/route.ts` | After email verification (`type === "signup"`), now patches the profile with `full_name`, `course`, `consent_deepseek` from `user_metadata` using the admin client |
| `src/app/layout.tsx` | Version badge position changed from `left: 14` to `right: 14` |
| `FRONTEND.md` | Bug fix documented; For Claude section added |

### Key decisions
- Consent value is stored in `user_metadata` at signup, then written to the profile in the callback — safe because users can't log in before verifying email, so the consent gate is never hit in that window.
- `course` and `full_name` follow the same pattern — DB trigger doesn't set them, callback does.
- Version not bumped this session — only bug fixes, no new features.

### Still pending / known open issues
- Teammates notified to update `handle_new_user()` trigger to read `consent_deepseek` from `NEW.raw_user_meta_data` directly.
- Pro subscription expiry: schema has `subscription_expires_at` but no auto-downgrade cron/trigger. Frontend should check both `subscription_tier` AND `subscription_expires_at` when gating Pro UI. Not fixed yet.
- `apply_card_review()` RPC not wired up — difficulty scores and review counters are never written to DB. Living Decks won't work until this is done.
- Several API routes still ⚠️ not implemented by backend (see API Routes table above).
