# Crammable — Missing Features / Gap Analysis

**Date:** 2026-06-10
**Method:** Cross-referenced what the app *promises* (`contracts.ts` tier table,
the `/upgrade` and `/rewards` pages, `schema.sql`) against what the code actually
wires up (every route handler + every page/component). Each item notes the
evidence and a rough effort.

> The core loop works: **upload → generate → study → quiz → manual GCash upgrade →
> admin approve**. What's missing is mostly (1) the **Pro value proposition**,
> (2) **3 of the 4 credit-earning methods**, and (3) **basic content management**
> (editing/deleting decks and cards).

Severity: **[P0]** advertised-but-broken / paid-feature gap · **[P1]** expected
core feature · **[P2]** nice-to-have / compliance.

---

## A. Backend exists, but no UI calls it (quick wins)

### A1. [P1] Delete a deck — endpoint orphaned
`DELETE /api/decks/[id]` is fully built (`deleteDeck`, cascades flashcards/quiz
rows via FK), but **no page calls it**. There's no delete button on the dashboard
cards or the deck-detail page.
- **Evidence:** `deleteDeck` appears only in `src/app/api/decks/[id]/route.ts`; no
  `fetch(..., { method: "DELETE" })` anywhere in `src/app`.
- **Effort:** ~30 min (a button + confirm + `fetch` + refresh/redirect).

---

## B. Advertised features that are entirely unbuilt

All of these are sold on `/upgrade` or `/rewards` but have no working implementation.

### B1. [P0] [DONE] Living Decks (Pro headline feature) — not implemented
"Your deck automatically adapts to your weak areas." In reality
`livingDeckRefreshTriggered` is hardcoded `false`, `getWeakCardsForDeck()` is
**never called**, no `is_reinforcement` cards are ever generated, and
`UIMessages.livingDeckUpsell` is never shown.
- **Evidence:** `quiz/result/route.ts` returns `livingDeckRefreshTriggered: false`;
  `getWeakCardsForDeck` only referenced in `flashcards.ts` + barrel; this is the
  long-open **TODO #8**.
- **Effort:** Medium — gate on Pro + consent + `scorePercent < 70` in the quiz-result
  path, fetch weak cards, call DeepSeek for new angles, insert reinforcement cards,
  charge 1 credit on success. Approach is spec'd in `docs/TODO.md §8`.
- **Resolution:** `quiz/result/route.ts` now checks `scorePercent < 70` for Pro
  users with `consent_deepseek = true`, fetches weak cards via
  `getWeakCardsForDeck()`, generates new-angle cards via
  `generateReinforcementCards()` (`deepseek/generate-cards.ts`), and inserts them
  atomically with a 1-credit charge via the new `insert_reinforcement_cards_and_charge()`
  RPC (rolls back on `INSUFFICIENT_CREDITS`, never charges on AI failure). Marks
  `quiz_sessions.living_deck_refresh_triggered = true` on success. Free users (or
  Pro without consent) instead get `upsellMessage: UIMessages.livingDeckUpsell`.
  The result page shows a "new cards added" banner or the upsell message
  accordingly.

### B2. [P0] [DONE] Deep Dive generation mode (Pro) — defined but dead
`GenerationMode.DEEP_DIVE` exists in `contracts.ts` + the `decks.generation_mode`
CHECK, and `/api/generate` *accepts* a `generationMode`, but:
- the upload UI (`PdfUploadFlow.tsx`) **never sends it** (only `extractedText` +
  `pdfType`),
- the DeepSeek prompt is **identical** regardless of mode (`generate-cards.ts` has
  one prompt), and
- there is **no tier gate** (a free user could pass `deep_dive` with no effect).
- **Effort:** Medium — add a mode toggle (Pro-gated) in the upload flow, pass it
  through, and branch the prompt (e.g. more cards / deeper explanations) in
  `generate-cards.ts`.
- **Resolution:** `PdfUploadFlow.tsx` now has a Pro-gated Standard/Deep Dive
  toggle (disabled with an upsell hint for free users) and sends `generationMode`
  to `/api/generate`. The route force-downgrades non-Pro requests to `standard`
  server-side (never trusts the client), and `generateFlashcardsFromText()` branches
  the DeepSeek prompt for `deep_dive` to produce richer explanations/examples per
  card. `decks.generation_mode` is persisted via `create_deck_with_cards_and_charge()`,
  and the deck-detail page shows a "Deep Dive" badge when set.

### B3. [P0] [DONE] PDF export (Pro) — not built
`TierLimits.pro.pdfExport: true` is advertised; there is no export endpoint and no
button anywhere.
- **Effort:** Medium — a `GET /api/decks/[id]/export` that renders cards to PDF
  (server-side) + a Pro-gated button.
- **Resolution:** Added `GET /api/decks/[id]/export` (`@react-pdf/renderer`,
  `src/lib/pdf/DeckPdfDocument.tsx`), gated on `TierLimits[tier].pdfExport`,
  rate-limited, returning the deck's cards as a downloadable PDF
  (`application/pdf`, `Content-Disposition: attachment` — documented as the one
  binary-response exception to the `ApiResponse<T>` envelope). Deck-detail page
  has a Pro-gated "Export PDF" button.

### B4. [P0] [DONE] 3 of the 4 "Ways to earn" on `/rewards` do nothing
Only **signup referral** actually credits (via `/api/referral/claim` +
`auth/callback` → `claim_referral`). The other three cards on the rewards page are
decorative:
- **Share a deck** (`deck_share`, +5, needs ≥10 cards) — no sharing flow, no
  endpoint, `decks.is_public` is never set.
- **Write a review** (`app_review`, +15, `requiresAdminVerification`) — no
  submission flow and no admin UI to verify it.
- **Complete your profile** (`profile_complete`, +3) — saving name/course in
  settings awards nothing; no trigger/endpoint.
- **Effort:** Medium each. `profile_complete` is the easiest (award once when
  name+course first set). `deck_share` depends on B5. `app_review` needs admin UI
  (see E4).
- **Resolution:** All three now work via a shared `claim_self_referral_event()`
  RPC (atomic, mirrors `claim_referral()`, self-guarded to `auth.uid()`,
  cap-checked via the existing `check_referral_cap()`):
  - **`profile_complete`** — `POST /api/rewards/claim-profile-complete` awards
    +3 credits the first time both `full_name` and `course` are set; wired into
    the settings save flow.
  - **`deck_share`** — `POST /api/decks/[id]/share` flips `decks.is_public`,
    and if `card_count >= ReferralCaps.deck_share.minCards` awards +5 credits
    once per deck (enforced by a new unique index
    `ux_referral_deck_share_once_per_deck`). Deck-detail page has a make
    public/private toggle with a copyable `Routes.publicDeck(id)` link.
  - **`app_review`** — `POST /api/rewards/submit-review` inserts into the new
    `app_reviews` table (one review per user); `/rewards` shows a star-rating +
    text submission form, or the review's pending/approved/rejected status.
    Admin approval via `GET /api/admin/reviews` + `POST
    /api/admin/reviews/verify` (new `verify_app_review()` RPC, mirrors
    `approve_payment()`/`reject_payment()`) awards +15 credits and logs to
    `admin_action_log`. New "Pending Reviews" section on `/admin`.
  - The `/rewards` page now reflects real earned/claimable state for all three
    cards instead of being decorative.

### B5. [P1] [DONE] Public / shared decks — reserved but unbuilt
`decks.is_public` and `Deck.is_public` exist ("reserved for future sharing"), but
there's no make-public toggle, no public deck viewer, and no share link. Blocks the
`deck_share` earn method (B4).
- **Effort:** Medium — a public-read RLS policy/route, a viewer page, a toggle.
- **Resolution:** Added additive RLS policies ("decks: anyone read public",
  "flashcards: anyone read of public deck") scoped to `is_public = true` (owner
  policies untouched, so writes stay owner-only). New read-only viewer at
  `Routes.publicDeck(id)` (`src/app/public/decks/[id]/page.tsx`) for
  anonymous/any visitors, with a friendly not-found state for private/missing
  decks. The share toggle from B4's `deck_share` flow lives on the deck-detail
  page and surfaces this link.

---

## C. Pro features silently NOT delivered (real bug)

### C1. [P0] [DONE] "Unlimited cards per deck" is capped at 20 for everyone
`TierLimits.pro.maxCardsPerDeck` is `Infinity` and `/upgrade` advertises "Unlimited
cards per deck," but `generate/route.ts` does:
```ts
const DEFAULT_MAX_CARDS = 20;
function maxCardsForTier(tier) {
  const limit = TierLimits[tier].maxCardsPerDeck;
  return limit === Infinity ? DEFAULT_MAX_CARDS : limit; // Pro → 20, same as free
}
```
So **Pro users get the same 20-card cap as free users**, and DeepSeek is even told
"up to 20." Direct mismatch between the paid pitch and behavior.
- **Effort:** Small — raise the Pro cap to a sane finite ceiling (e.g. 50–60, to
  bound DeepSeek cost/latency) instead of silently reusing the free cap, and update
  the `/upgrade` copy to match reality.
- **Resolution:** `TierLimits.pro.maxCardsPerDeck` raised from `Infinity` to `60`
  in `contracts.ts`; `maxCardsForTier()` in `generate/route.ts` now returns the
  tier limit directly (the `Infinity` → 20 fallback is gone).

---

## D. Content-management / study features users will expect

### D1. [P1] No flashcard editing (no card-level CRUD)
There is **no `/api/flashcards` route at all** — you can't edit a card's front/back,
fix an AI mistake, add a card manually, or delete a single card. Decks are 100%
AI-generated and immutable.
- **Effort:** Medium — a `flashcards` route (`PATCH`/`POST`/`DELETE`) + inline edit
  UI on the deck-detail page. RLS already scopes flashcards to the owner.

### D2. [P1] No deck rename / edit
`decks/[id]/route.ts` has only `GET` + `DELETE` — no `PATCH`. The title is fixed at
generation time.
- **Effort:** Small — add `PATCH /api/decks/[id]` (title) + an edit affordance.

### D3. [P1] No quiz history / progress view
`quiz_sessions` records every attempt and score, but the result page reads only from
`sessionStorage` — refresh it and you get "No quiz results found." There is no
"past quizzes / score over time" view anywhere; the stored history is effectively
write-only to the user.
- **Effort:** Medium — a `GET /api/quiz/history` (or reuse a sessions list) + a
  history/progress section on the deck or dashboard.

### D4. [P2] No "study weak cards" mode / spaced repetition
`difficulty_score` and `last_reviewed_at` are tracked per card but never used — the
deck viewer shows cards in creation order. The only intended consumer is Living Deck
(B1), which is unbuilt.
- **Effort:** Small-Medium once the data is surfaced — a study mode that orders by
  `difficulty_score DESC`.

---

## E. Payments, notifications, admin, account & compliance

### E1. [P1] No payment status notifications
`UIMessages.paymentApproved` / `paymentRejected` exist, and `schema.sql` notes
"enable Realtime on `payment_submissions` for live student notifications," but the
client has **no realtime subscription and no notification UI** — a user must manually
revisit `/upgrade` to learn if they were approved/rejected.
- **Effort:** Small-Medium — a Supabase Realtime subscription on the user's payment
  row + a toast/badge.

### E2. [P0] [DONE] Can't actually pay — `App.gcashNumber` is blank
`contracts.ts` `App.gcashNumber = ""`, so `/upgrade` can't show a number and tells
users to email support instead. Real payments can't flow until this is filled in.
- **Effort:** Trivial (set the value) — but it's a hard launch blocker.
- **Resolution:** `App.gcashNumber` set to `"09691816930"` in `contracts.ts`.

### E3. [P1] [DONE] No Pro expiry enforcement
`subscription_expires_at` is set (+30 days, renewals stack) but **nothing downgrades
a lapsed Pro back to `free`**, and feature gates check `subscription_tier`, not the
expiry date. Once Pro, always Pro until an admin changes it.
- **Effort:** Small — a daily `pg_cron` job (or a check) that flips expired Pros to
  `free`, mirroring the existing `pro_monthly_credit_refresh` cron.
- **Resolution:** Added `public.downgrade_expired_pro()` (SECURITY DEFINER,
  §4.7c in `schema.sql`) that sets `subscription_tier = 'free'` and clears
  `subscription_expires_at` for Pro profiles whose `subscription_expires_at`
  has passed. Scheduled as the `crammable-pro-expiry-downgrade` daily pg_cron
  job (midnight UTC), alongside the existing `pro_monthly_credit_refresh` job.
  Schema re-run against the live Supabase project is **complete** — the
  function, cron job, and all B1–B5 schema additions (see below) are live.

### E4. [P1] No admin tooling beyond payments
The admin dashboard only approves/rejects payments. There is no UI for: verifying
`app_review` referrals (B4), granting credits manually, managing users, or viewing
the `admin_action_log` audit trail.
- **Effort:** Medium — extends the existing `/admin` page + a couple of routes.

### E5. [P2] No account deletion / data export (RA 10173)
Settings only has "Sign out." For the privacy law this app explicitly cares about,
users arguably should be able to **delete their account** and **export their data**;
neither exists. (An auditable consent timestamp is also worth adding — currently
`consent_deepseek` is just a boolean.)
- **Effort:** Medium — a delete-account flow (cascades via FK) + a data-export
  endpoint.

---

## Suggested order of attack

| # | Item | Why first | Effort | Status |
|---|---|---|---|---|
| 1 | **C1** Pro card-cap bug | A paid promise is broken right now | S | ✅ Done |
| 2 | **E2** Fill `gcashNumber` | Hard launch blocker — nobody can pay | trivial | ✅ Done |
| 3 | **A1** Delete-deck button | Endpoint already exists; pure UI | S | |
| 4 | **D2** Rename deck | Tiny route + affordance | S | |
| 5 | **E3** Pro expiry cron | Subscriptions never actually end | S | ✅ Done |
| 6 | **D1** Flashcard editing | Core content management gap | M | |
| 7 | **B1** Living Decks | The flagship Pro feature, fully spec'd | M | ✅ Done |
| 8 | **B2 / B3** Deep Dive / PDF export | Remaining Pro promises | M | ✅ Done |
| 9 | **B4** Profile-complete + review + deck-share earns | Rewards page is mostly decorative | M | ✅ Done |
| 10 | **D3 / E1 / E4 / E5** History, notifications, admin, account | Depth + compliance | M+ | |

**B5** (public/shared decks) was completed alongside B4, since the deck-share
earn method depends on it.

---

## Notes

- This reflects code state as of **2026-06-10**, after the audit-fix session
  (see `WORK_SUMMARY_2026-06-10.md`).
- The original `docs/TODO.md` items 9/10/11 (payment-submit, admin payment routes,
  referral-claim) and item 2 (forgot-password page) are **already built** — those
  docs were stale and have been corrected.
- The frontend "decorative vs functional" mismatches (B4 especially) are the most
  likely to confuse users, since the UI actively advertises earning methods that
  silently do nothing.
