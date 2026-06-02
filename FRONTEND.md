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

## Version History

| Version | What changed |
|---|---|
| v1.01 | Landing page, login page, signup page, contracts.ts |
| v1.02 | Merged auth-ocr branch, fixed Tailwind v4, updated dependencies, added dashboard |
| v1.03 | Fixed auth flow, restored signup/login/dashboard, fixed browser client |
| v1.04 | Added /decks/new wrapper, /decks/[id] flip-card viewer, /quiz/[deckId] session, /quiz/[deckId]/result |
| v1.05 | Added /upgrade — GCash manual payment flow |
| v1.06 | Added /rewards, /settings, /admin — all pages complete |
| v1.07 | Fixed login: replaced deprecated middleware.ts with proxy.ts (Next.js 16) |
