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
| `/dashboard` | `src/app/dashboard/page.tsx` | ✅ Done | User dashboard — shows credits, decks, plan |
| `/decks/new` | `src/app/decks/new/page.tsx` | 🔲 Next | PDF upload → AI generation flow |
| `/decks/[id]` | `src/app/decks/[id]/page.tsx` | 🔲 Pending | Deck detail — flashcard viewer |
| `/quiz/[deckId]` | `src/app/quiz/[deckId]/page.tsx` | 🔲 Pending | Interactive quiz session |
| `/quiz/[deckId]/result` | `src/app/quiz/[deckId]/result/page.tsx` | 🔲 Pending | Quiz results screen |
| `/upgrade` | `src/app/upgrade/page.tsx` | 🔲 Pending | GCash payment / Pro upgrade |
| `/rewards` | `src/app/rewards/page.tsx` | 🔲 Pending | Referral & credits hub |
| `/settings` | `src/app/settings/page.tsx` | 🔲 Pending | Profile settings |
| `/admin` | `src/app/admin/page.tsx` | 🔲 Pending | Admin payment approval panel |

---

## API Routes the Frontend Calls

These are all defined in `contracts.ts` under `ApiPaths`. The frontend
calls these via `fetch()` — the backend team owns the implementation.

| Endpoint | Method | Used by page |
|---|---|---|
| `/api/upload` | POST | `/decks/new` |
| `/api/generate` | POST | `/decks/new` |
| `/api/decks` | GET | `/dashboard` |
| `/api/decks/[id]` | GET | `/decks/[id]` |
| `/api/quiz/[id]` | POST | `/quiz/[deckId]` |
| `/api/quiz/result` | POST | `/quiz/[deckId]` |
| `/api/referral/claim` | POST | `/rewards` |
| `/api/payment/submit` | POST | `/upgrade` |
| `/api/admin/payments` | GET | `/admin` |
| `/api/admin/payments/approve` | POST | `/admin` |
| `/api/admin/payments/reject` | POST | `/admin` |

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

Create `.env.local` in the root:
```
NEXT_PUBLIC_SUPABASE_URL=https://gjrdlmxlqngqcnflygcp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_dGN7NMHRmhnu9GfT25Jdhw_z6N2yPGD
SUPABASE_URL=https://gjrdlmxlqngqcnflygcp.supabase.co
```

Then run: `npm run dev`

---

## Version History

| Version | What changed |
|---|---|
| v1.01 | Landing page, login page, signup page, contracts.ts |
| v1.02 | Merged auth-ocr branch, fixed Tailwind v4, updated dependencies, added dashboard |
