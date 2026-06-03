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
| v.03 | DeepSeek flashcard generation live — merged prompt/AI-Gen branch, added openai package, full generate route (auth + Supabase persistence + credit deduction), PdfUploadFlow wired to callGenerate, PDF_EXTRACTION_TEST_MODE off, version badge moved to bottom-right |

---

## For Claude (Session Lifeline)

**Last session: 2026-06-03**

### What happened
- Login tested and working — Yujin logged in with existing account (aerochrom2420@gmail.com)
- Version badge moved from bottom-left to bottom-right (was covered by browser UI)
- Discovered backend branch `prompt/AI-Gen` had full DeepSeek implementation ready
- Merged `prompt/AI-Gen` into `FrontEnd` — clean merge, no conflicts
- New files added: `src/lib/deepseek/client.ts`, `generate-cards.ts`, `index.ts`
- `openai ^6.41.0` installed (DeepSeek uses OpenAI-compatible API)
- `PDF_EXTRACTION_TEST_MODE` set to `false` — generation is now live
- DeepSeek API key added to `.env.local` (`DEEPSEEK_API_KEY`)
- Model set to `deepseek-v4-flash` in `.env.local`
- `SUPABASE_SERVICE_ROLE_KEY` still missing — without it, cards generate but are NOT saved to DB (preview mode only). Full persistence needs this key from Alcazar.
- Version bumped to v.03

### Pending
- Get `SUPABASE_SERVICE_ROLE_KEY` from Alcazar — needed for deck/flashcard saves + credit deduction
- Test full flow end-to-end with service role key: upload PDF → generate → save deck → redirect to `/decks/[id]`
- Verify `/decks/[id]` and `/quiz/[deckId]` pages work with real saved data

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
