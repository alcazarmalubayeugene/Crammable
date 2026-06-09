# TODO — deferred work

Items intentionally postponed. Each has enough context to pick up later.
Frontend page status is in `FRONTEND.md`. Unimplemented backend routes are tracked in
`docs/PROJECT-DOCUMENTATION.md §9`.

---

## Auth / login

### ~~1. Login "email not confirmed" UX (enumeration-safe)~~ ✅ Done
- **Files touched:** `src/app/login/page.tsx`, reused existing resend route.

### 2. Missing `/forgot-password` page (404) — backend done, frontend spec in `FRONTEND.md`
- **What:** `src/app/login/page.tsx` links to `/forgot-password`, but there is **no**
  `src/app/forgot-password/page.tsx` — the link 404s today.
- **Backend:** `POST /api/auth/forgot-password` and `POST /api/auth/reset-password` both
  exist and are enumeration-safe. The reset callback lands on
  `/api/auth/callback?type=recovery`.
- **Frontend needed:** new `src/app/forgot-password/page.tsx` (email form → posts to
  forgot-password route → shows "if an account exists…" confirmation); a
  `/settings?mode=reset-password` UI to complete the flow after the email link is clicked.
- **Spec:** see `FRONTEND.md` — "Frontend spec — forgot-password & reset-password flow".
- **Files:** new `src/app/forgot-password/page.tsx`; update settings page for reset-password
  mode.

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

### 6b. Migrate dashboard + deck-detail pages off Supabase-direct reads  ⚠️ Frontend
- **What:** `src/app/dashboard/page.tsx` and `src/app/decks/[id]/page.tsx` still call
  `getSupabaseBrowserClient()` directly — they were intentional workarounds before the
  proper routes existed. Now that §6 is done, swap them for API calls.
- **Approach:**
  - `dashboard/page.tsx`: replace the Supabase deck query with `GET /api/decks`
    (`ApiPaths.decks`). Response shape: `{ success: true, decks: Deck[] }`.
  - `decks/[id]/page.tsx`: replace the deck + flashcard queries with `GET /api/decks/[id]`
    (`ApiPaths.deck(id)`). Response shape: `{ success: true, deck: Deck, cards: Flashcard[] }`.
  - Both routes return 404 (`ApiErrorCode.FORBIDDEN`) when the deck doesn't belong to the
    user — redirect to dashboard on that case.
  - Auth is cookie-based (`requireAuth()`), so plain `fetch()` — no Bearer token needed.
- **Files:** `src/app/dashboard/page.tsx`; `src/app/decks/[id]/page.tsx`.

### ~~7. Quiz API routes (`POST /api/quiz/[id]`, `POST /api/quiz/result`)~~ ✅ Done
- **Files touched:** new `src/app/api/quiz/[id]/route.ts` (server-side question builder,
  same-category MC distractors, creates `quiz_sessions` row); new
  `src/app/api/quiz/result/route.ts` (rate-limited, persists answers, calls
  `apply_card_review()` per card, finalises session);
  `src/app/quiz/[deckId]/page.tsx` (migrated to API — no more client-side question
  building or Supabase-direct reads).

---

## Premium features

### 8. Living Deck (Pro only)  ← unblocked by §7
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
- **Files:** `src/app/api/quiz/result/route.ts` (trigger point — `livingDeckRefreshTriggered`
  is already wired as `false`); `src/lib/db/flashcards.ts` (`getWeakCardsForDeck`,
  `insertFlashcards`); `src/lib/db/rpc.ts` (`deductCredit`); `src/lib/contracts.ts`
  (add `upsellMessage?: string` to `SubmitQuizResultData`).

---

## Payments & admin

### 9. Wire `POST /api/payment/submit`
- **What:** The `/upgrade` page form is built — the backend route doesn't exist yet.
- **Approach:**
  - Validate `referenceNumber` against `Validation.referenceNumber.pattern` (13 digits) →
    `INVALID_REFERENCE_NUMBER`.
  - Check for an existing `pending` row → `PAYMENT_ALREADY_PENDING`.
  - Insert via `src/lib/db/payments.ts`; rate limit 2/24h
    (`RateLimits[ApiPaths.submitPayment]`).
  - Return `ApiResponse<SubmitPaymentResult>` including `UIMessages.verificationEta`.
  - **Never auto-activate Pro** — admin must approve.
- **Files:** new `src/app/api/payment/submit/route.ts`; `src/lib/db/payments.ts`;
  update `src/app/upgrade/page.tsx`.

### 10. Wire admin payment routes (`GET /api/admin/payments`, approve, reject)
- **What:** The `/admin` page exists — the three routes it calls are not implemented.
- **Approach:**
  - All three routes gate behind `requireAdmin()` first.
  - `GET /api/admin/payments` → `ApiResponse<AdminPaymentsListResult>` — join payments +
    profiles for `userEmail`; compute `minutesSinceSubmission` server-side.
  - `POST /api/admin/payments/approve` + `POST /api/admin/payments/reject` → use
    `approvePayment()` and `rejectPayment()` from `src/lib/db/admin.ts` (atomic RPCs).
  - Rejection requires `rejectionReason` (shown to student via `UIMessages.paymentRejected`).
  - Approval writes `admin_action_log` automatically inside the RPC.
- **Files:** new `src/app/api/admin/payments/route.ts`, `approve/route.ts`,
  `reject/route.ts`; `src/lib/db/admin.ts`; update `src/app/admin/page.tsx`.

---

## Referral

### 11. Wire `POST /api/referral/claim`
- **What:** The `/rewards` page is built — the claim route doesn't exist yet.
- **Approach:**
  - Accept `ClaimReferralRequest` (`referralCode: string`); validate length against
    `Validation.referralCode.length` (8 chars) → `INVALID_REFERRAL_CODE`.
  - Look up the referrer via `getProfileIdByReferralCode()` — returns only the ID (no
    profile-data leak).
  - Call `checkReferralCap()` RPC; handle `SELF_REFERRAL` and `REFERRAL_CAP_REACHED`.
  - If allowed: `grantCredits()` for referrer + `logReferralEvent()`.
  - Rate limit: 5/24h (`RateLimits[ApiPaths.claimReferral]`).
  - Return `ApiResponse<ClaimReferralResult>` (`creditsAwarded`, `newBalance`).
- **Files:** new `src/app/api/referral/claim/route.ts`; `src/lib/db/referrals.ts`;
  `src/lib/db/rpc.ts`; update `src/app/rewards/page.tsx`.
