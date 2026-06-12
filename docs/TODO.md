# TODO — deferred work

Items intentionally postponed. Each has enough context to pick up later.
Frontend page status is in `FRONTEND.md`. Unimplemented backend routes are tracked in
`docs/PROJECT-DOCUMENTATION.md §9`.

> **Status note (2026-06-11):** **every item in this file is now DONE**, including
> **#8 (Living Deck)**. This file is kept only as a historical record of the
> original backend roadmap. The broader advertised-feature set (Pro features,
> reward methods, card/deck editing, admin tooling, account export/delete) is also
> implemented — see **`docs/MISSING_FEATURES.md`** for that status. The one
> remaining product gap is **deck-delete UI** (endpoint exists, no button) —
> tracked in `docs/MISSING_FEATURES.md` A1 and `docs/BASIC_UI.md`.

---

## Auth / login

### ~~1. Login "email not confirmed" UX (enumeration-safe)~~ ✅ Done
- **Files touched:** `src/app/login/page.tsx`, reused existing resend route.

### ~~2. Missing `/forgot-password` page~~ ✅ Done
- **Built:** `src/app/forgot-password/page.tsx` exists (email form → posts to the
  enumeration-safe `POST /api/auth/forgot-password`, with a resend cooldown), and the
  settings page handles `?mode=reset-password` (calls `POST /api/auth/reset-password`).
- The reset callback lands on `/api/auth/callback?type=recovery`.

---

## Upload & extraction

### ~~3. Improve OCR accuracy for mixed PDFs~~ ✅ Done
- **Files touched:** `src/lib/pdf/extract-text-server.ts` (per-page classification),
  `src/lib/pdf/render-pages-client.ts` (selective rendering), `src/lib/pdf/ocr-client.ts`
  (LSTM_ONLY + PSM.AUTO), `src/components/upload/PdfUploadFlow.tsx` (partial-text merge).

---

## Generation

### ~~4. DeepSeek prompt — categorised JSON output~~ ✅ Done
- **Files touched:** `src/lib/contracts.ts` (`category` on `GeneratedCard` + `Flashcard`),
  `schema.sql` (migration), `src/lib/deepseek/generate-cards.ts` (categorised prompt +
  parser), `src/lib/db/flashcards.ts`, `src/app/api/generate/route.ts`.

### ~~5. Wire `/api/generate` out of test mode~~ ✅ Done
- **Files touched:** `src/lib/dev/pdf-test-mode.ts` (flag → false),
  `src/app/api/generate/route.ts` (removed test-mode block, added deck-limit check, migrated
  to `createDeckWithCards()` + `deductCredit()`).

---

## Decks & quiz

### ~~6. Deck API routes (`GET /api/decks`, `GET /api/decks/[id]`, `DELETE /api/decks/[id]`)~~ ✅ Done
- **Files touched:** new `src/app/api/decks/route.ts`; new
  `src/app/api/decks/[id]/route.ts`. Both use `requireAuth()` + `handleApiError()`;
  ownership is enforced by the session-client RLS — 404 for non-owned or missing decks.

### ~~6b. Migrate dashboard + deck-detail pages off Supabase-direct deck reads~~ ✅ Done
- **Built:** `dashboard/page.tsx` lists decks via `GET /api/decks`; `decks/[id]/page.tsx`
  loads the deck + cards via `GET /api/decks/[id]` (both cookie-auth, RLS-scoped, 404 →
  redirect/error). Each page still does a **direct, RLS-scoped read for the user's own
  profile** (token balance / name) because there is no profile API route — that's
  intentional, not the workaround this item was about.

### ~~7. Quiz API routes (`POST /api/quiz/[id]`, `POST /api/quiz/result`)~~ ✅ Done
- **Files touched:** new `src/app/api/quiz/[id]/route.ts` (server-side question builder,
  same-category MC distractors, creates `quiz_sessions` row); new
  `src/app/api/quiz/result/route.ts` (rate-limited, persists answers, calls
  `apply_card_review()` per card, finalises session);
  `src/app/quiz/[deckId]/page.tsx` (migrated to API — no more client-side question
  building or Supabase-direct reads).

---

## Premium features

### ~~8. Living Deck (Pro only)~~ ✅ Done (2026-06-11)
- **Built:** `POST /api/quiz/result` now gates on `subscription_tier === 'pro'` +
  `consent_deepseek` + `scorePercent < LivingDeck.scorePercentThreshold` (70). On a
  weak result it calls `getWeakCardsForDeck()`, sends them to
  `generateReinforcementCards()` (DeepSeek, new-angle prompt), and inserts the
  cards + charges 1 credit atomically via the `insert_reinforcement_cards_and_charge()`
  RPC (schema §4.14c) — so an AI failure or `INSUFFICIENT_CREDITS` rolls back with no
  charge. A per-deck card-cap guard prevents exceeding `TierLimits.pro.maxCardsPerDeck`.
  Free users get `upsellMessage` (`UIMessages.livingDeckUpsell`) instead. The quiz
  result page renders the reinforcement notice / upsell.
- **Files:** `src/app/api/quiz/result/route.ts`, `src/lib/db/flashcards.ts`
  (`insertReinforcementCardsAndCharge`), `src/lib/deepseek/generate-cards.ts`
  (`generateReinforcementCards`), `src/app/quiz/[deckId]/result/page.tsx`,
  `schema.sql` (§4.14c), `contracts.ts` (`LivingDeck.scorePercentThreshold`,
  `SubmitQuizResultData.upsellMessage`).

<details><summary>Original spec (historical)</summary>

- **What:** After a quiz where the student misses cards, automatically generate new
  angles on those weak topics using DeepSeek. Pro-only; gate it in the quiz result handler.
- **Approach:**
  - Weak cards = `difficulty_score ≥ LivingDeck.weakCardThreshold` (0.7), capped at
    `LivingDeck.maxWeakCardsPerRefresh` (5) — constants in `contracts.ts`.
  - In `POST /api/quiz/result`: after `completeQuizSession()`, check if
    `profile.subscription_tier === 'pro'` AND `profile.consent_deepseek` AND
    `scorePercent < 70`. If all three, trigger the refresh.
  - Call `getWeakCardsForDeck(session.deck_id)` → send card fronts + category to DeepSeek:
    *"Generate a new angle on each topic below without repeating exact wording."*
  - Mark generated cards `is_reinforcement = true`; insert via `insertFlashcards()`.
  - Deduct 1 credit via `deductCredit()` only after successful generation. On AI failure,
    return `livingDeckRefreshTriggered: false` and do not charge.
  - Free users: set `livingDeckRefreshTriggered: false`, include `UIMessages.livingDeckUpsell`
    in a separate `upsellMessage` field (add to `SubmitQuizResultData` in contracts first).
  - Return `livingDeckRefreshTriggered: true` + `reinforcedCardCount` when it fires.

</details>

---

## Payments & admin

### ~~9. Wire `POST /api/payment/submit`~~ ✅ Done
- **Built:** `src/app/api/payment/submit/route.ts` — validates the 13-digit reference,
  amount, and method; rate-limited 2/24h; inserts via `createPaymentSubmission`; one
  pending per user + unique reference enforced at the DB. Never auto-activates Pro. The
  `/upgrade` page posts to it. (CSRF origin check added 2026-06-10.)

### ~~10. Wire admin payment routes~~ ✅ Done
- **Built:** `GET /api/admin/payments` (+ `userEmail`, `minutesSinceSubmission`),
  `POST /api/admin/payments/approve`, `POST /api/admin/payments/reject` — all gated by
  `requireAdmin()`, using the atomic `approvePayment()` / `rejectPayment()` RPCs. The
  `/admin` page calls all three.

---

## Referral

### ~~11. Wire `POST /api/referral/claim`~~ ✅ Done (and hardened)
- **Built:** `src/app/api/referral/claim/route.ts` — validates the 8-char code, resolves
  the referrer by id only, rate-limited 5/24h.
- **2026-06-10 hardening:** attribution was made atomic and single-source. Both the claim
  route AND `auth/callback` now call one `claim_referral()` SECURITY DEFINER RPC (lock →
  re-check `referred_by`/self/cap → insert ledger → credit referrer → set `referred_by`),
  backed by a partial unique index `ux_referral_signup_once_per_referred`. This replaced
  the old non-atomic two-path flow that could double-award. See `WORK_SUMMARY_2026-06-10.md`.
