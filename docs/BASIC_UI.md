# Crammable — Basic UI Spec & Gap Analysis

**Date:** 2026-06-11
**Branch audited:** `backend-audit-fixes` (= `origin/backend` + audit fixes)
**Method:** Defined the *basic UI* every screen/feature should expose, then walked
every page in `src/app/**` and `src/components/**` and mapped each backend
capability (route handler) to the UI that drives it. "Present" means a real,
wired affordance (button/form/`fetch`), not just that the endpoint exists.

> **TL;DR.** The branch is UI-complete for almost the entire feature set — upload,
> Deep Dive, generate, study, quiz, Living Deck, flashcard CRUD, rename, share,
> export, quiz history, rewards (all 4 earn methods), payments, admin tooling,
> account export/delete. The gaps are small: **deck deletion has no UI at all**
> (the endpoint is orphaned), there are **no error/404/loading boundary pages**,
> **no admin entry point** in the nav, and **no shared nav/footer component**.

Severity: **[P1]** advertised/expected feature with no UI · **[P2]** UX/robustness gap.

---

## 1. The "basic UI" — what each area should expose

### Global chrome (every authenticated screen)
- A consistent top nav: logo/home, credit balance, links to Rewards / Settings,
  (for admins) Admin, current user, Log out.
- An admin entry point visible only to admins.
- App-wide states: a **404 / not-found** page, an **error boundary** page, and a
  route-level **loading** state.
- A footer (or at least version chip).

### Auth
- Landing page, Sign up (name, course, referral code, AI consent), Log in,
  Forgot password, Reset password, Resend confirmation.

### Dashboard
- Welcome + stats (credits, deck count, plan), deck grid, empty state,
  "new deck" entry, and per-deck **quick actions (open, delete)**.

### Upload → Generate (`/decks/new`)
- File picker + drag/drop, extraction-path messaging (text vs OCR vs paste),
  paste fallback, **Standard vs Deep Dive (Pro) toggle**, progress, errors.

### Deck detail (`/decks/[id]`)
- Card browser, **rename deck**, **delete deck**, **add card**, **edit card**,
  **delete card**, **share / unshare + copy public link**, **export PDF**,
  **study weak-cards mode**, **quiz history** for the deck, start-quiz entry.

### Quiz (`/quiz/[deckId]` + `/result`)
- Question runner (MC + identification), submit, score result,
  **Living Deck reinforcement notice** (Pro) / **upsell** (free).

### Public viewer (`/public/decks/[id]`)
- Read-only card browser, no auth, no edit/quiz.

### Rewards (`/rewards`)
- Referral code + claim form, and the 4 earn methods:
  **signup referral**, **share a deck**, **write a review**, **complete profile**;
  history list.

### Upgrade / Payments (`/upgrade`)
- Pro pitch, GCash number, reference-number submit form, pending/approve/reject
  feedback (live).

### Settings (`/settings`)
- Edit profile (name/course) → **profile-complete reward**, change password,
  **export my data**, **delete account**, sign out.

### Admin (`/admin`)
- Pending payments approve/reject, **app-review verification**,
  **user list + grant credits**, **audit log**.

---

## 2. Coverage matrix (present vs missing)

| Area | Backend | UI present? | Where |
|---|---|---|---|
| Landing / Login / Signup | ✓ | ✅ | `page.tsx`, `login`, `signup` |
| Forgot / Reset / Resend confirm | ✓ | ✅ | `forgot-password`, `settings`, `login`/`signup` |
| Dashboard + stats + deck grid + empty state | ✓ | ✅ | `dashboard/page.tsx` |
| Upload + OCR/paste fallback | ✓ | ✅ | `components/upload/PdfUploadFlow.tsx` |
| **Deep Dive toggle (B2, Pro)** | ✓ | ✅ | `PdfUploadFlow.tsx:446` |
| Generate deck | ✓ | ✅ | `PdfUploadFlow.tsx:152` |
| Deck viewer | ✓ | ✅ | `decks/[id]/page.tsx` |
| **Rename deck (D2)** | ✓ | ✅ | `decks/[id]` PATCH |
| **Delete deck (A1)** | ✓ (`DELETE /api/decks/[id]`) | ❌ **MISSING** | — |
| **Add / edit / delete card (D1)** | ✓ | ✅ | `decks/[id]` |
| **Share / unshare + copy link (B5)** | ✓ | ✅ | `decks/[id]` toggleShare |
| **Export PDF (B3, Pro)** | ✓ | ✅ | `decks/[id]:663` link |
| **Study weak-cards mode (D4)** | ✓ | ✅ | `decks/[id]` studyWeakMode |
| **Quiz history per deck (D3)** | ✓ | ✅ | `decks/[id]` quizHistory |
| Quiz runner + submit | ✓ | ✅ | `quiz/[deckId]` |
| Quiz result + score | ✓ | ✅ | `quiz/[deckId]/result` |
| **Living Deck notice / upsell (B1)** | ✓ | ✅ | `quiz/[deckId]/result:195` |
| Public deck viewer | ✓ | ✅ | `public/decks/[id]` |
| Referral claim | ✓ | ✅ | `rewards` |
| **Share-a-deck earn (B4)** | ✓ | ✅ | `decks/[id]` |
| **Write-a-review earn (B4)** | ✓ | ✅ | `rewards:152` |
| **Profile-complete earn (B4)** | ✓ | ✅ | `settings:117` |
| Pay / submit GCash ref | ✓ | ✅ | `upgrade` |
| Payment approve/reject notice (E1) | ✓ | ✅ | `PaymentNotifications.tsx` (toast) |
| Admin: payments | ✓ | ✅ | `admin` |
| **Admin: review verify (E4)** | ✓ | ✅ | `admin:229` |
| **Admin: users + grant credits (E4)** | ✓ | ✅ | `admin:153/193` |
| **Admin: audit log (E4)** | ✓ | ✅ | `admin:170` |
| **Account export (E5)** | ✓ | ✅ | `settings:156` |
| **Account delete (E5)** | ✓ | ✅ | `settings:185` |

---

## 3. Missing UI — the actual list

### [P1] Delete a deck — endpoint exists, no UI
`DELETE /api/decks/[id]` (`deleteDeck`, cascades cards/quiz rows) is fully built,
but **nothing calls it**. There's no delete control on the dashboard deck cards
and none on the deck-detail page. Users can create and rename decks but never
remove one. This is the long-standing `MISSING_FEATURES.md` **A1** item — still
open on this branch (a delete button exists only on the separate, unmerged
`origin/FrontEnd` branch).
- **Where it belongs:** a "Delete deck" action on `decks/[id]/page.tsx` (next to
  Rename) and/or a per-card overflow action on the dashboard grid, with a
  `window.confirm` + `fetch(ApiPaths.deck(id), { method: "DELETE" })` + redirect
  to the dashboard.
- **Effort:** ~30 min (the card-delete pattern at `decks/[id]:304` is a template).

### [P2] No app-wide error / 404 / loading pages
There is no `not-found.tsx`, `error.tsx`, `global-error.tsx`, or `loading.tsx`
anywhere under `src/app`. A bad deck ID, a thrown render error, or a slow route
falls back to Next.js's bare default instead of an on-brand screen. Each page
hand-rolls its own inline loading/error text, so behaviour is inconsistent.
- **Add:** `src/app/not-found.tsx`, `src/app/error.tsx` (client error boundary),
  and optionally route-level `loading.tsx` for the dashboard/deck pages.

### [P2] No admin entry point in the UI
`/admin` is reachable only by typing the URL. The dashboard nav has no
admin-only link, even though the page already knows `subscription_tier`/role.
- **Add:** an "Admin" nav link in `dashboard/page.tsx` (and the shared nav, once
  it exists) gated on `is_admin`.

### [P2] No shared navigation / footer component
The top nav is re-implemented inline in `dashboard`, `public/decks/[id]`, and
elsewhere; deck/rewards/settings/upgrade/admin each render their own chrome.
There is no reusable `<Navbar>` / `<Footer>`. This isn't a missing *feature* but
it's the reason the two gaps above (admin link, consistent states) are easy to
miss — a single shared header would carry the credit balance, nav links, the
admin link, and the user menu in one place.
- **Add:** `src/components/Navbar.tsx` (+ `Footer`) and adopt across authed pages.

---

## 4. Notes
- Everything in §2 marked ✅ was verified by an actual wired `fetch`/affordance,
  not just an existing endpoint.
- The only **orphaned backend capability** (endpoint with zero UI) is
  **deck deletion**. Every other route has a driver in the UI.
- The §3 [P2] items are robustness/structure, not feature gaps — the app is
  fully usable without them, but they're the difference between "works" and
  "polished".
