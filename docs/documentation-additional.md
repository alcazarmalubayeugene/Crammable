# Documentation — Additional

Supplementary documentation for the **Crammable** backend, separate from the root `README.md`,
`CLAUDE.md`, and `AGENTS.md`. It records the build and hardening of **roadmap item #3 — the Supabase
integration (data-access) layer** on the `feature/auth` branch, the production-readiness reviews it went
through, and the final state.

> **Stack:** Next.js 16.2.6 · Supabase (Postgres + RLS) · TypeScript · Vitest. Single source of truth for
> enums/types/limits is `contracts.ts` (mirrored at `src/lib/contracts.ts`).

---

## 1. What the integration layer is

A typed data-access layer that every API route in features #4–12 (upload, generate, deck viewer, quiz,
credits, payments, referrals, living decks) builds on, so route handlers call small typed helpers instead of
re-deriving Supabase queries, RPC calls, rate-limit plumbing, and error handling each time.

It lives in:

- `src/lib/db/*` — the data-access helpers and DB error mapping.
- `src/lib/api/errors.ts` — the shared route response/error handler.
- `src/lib/db/validate.ts` — write-path input guards.
- `schema.sql` — the Postgres functions/triggers/RLS the layer depends on.

Tests: `tests/*.test.ts` (Vitest, Supabase mocked) + `vitest.config.ts`.

---

## 2. What was built (module by module)

| File | Responsibility |
|---|---|
| `src/lib/db/errors.ts` | `DbError` (carries an `ApiErrorCode` + HTTP status); `dbError(code, msg)`; `toDbError(PostgrestError)` mapping SQLSTATEs (23505/23514/23503) and our `RAISE EXCEPTION` sentinels to typed errors; logs the raw cause on 500-class faults. |
| `src/lib/api/errors.ts` | `handleApiError(err)` — the standard route `catch` (AuthError→401/403, DbError→its code, ZodError→400, unknown→opaque 500); `apiSuccess<T>(data)` — spreads the payload next to `success: true` per `ApiResponse<T>`. |
| `src/lib/db/rpc.ts` | Service-role wrappers: `deductCredit`, `grantCredits`, `checkReferralCap`. |
| `src/lib/db/rate-limit.ts` | `checkRateLimit(userId, endpoint)` → `RateLimitResult`; `enforceRateLimit` (throws `RATE_LIMITED`). Reads `RateLimits[endpoint]` from contracts. |
| `src/lib/db/profiles.ts` | `getProfileById`, `updateOwnProfile` (whitelisted), `getProfileIdByReferralCode` (id only), `setReferredBy`. |
| `src/lib/db/decks.ts` | `createDeck`, `listDecksForUser`, `getDeckById`, `getDeckWithCards`, `countDecksForUser`, `updateDeckCardCount`, `deleteDeck`, `createDeckWithCards` (compensating delete). |
| `src/lib/db/flashcards.ts` | `insertFlashcards`, `getFlashcardsForDeck`, `getWeakCardsForDeck`, `applyCardReview` (atomic RPC). |
| `src/lib/db/quiz.ts` | `createQuizSession`, `getQuizSessionById`, `insertQuizAnswers`, `completeQuizSession`. |
| `src/lib/db/payments.ts` | `createPaymentSubmission`, `listUserPayments`. |
| `src/lib/db/referrals.ts` | `logReferralEvent`, `listReferralEventsForCurrentUser`. |
| `src/lib/db/admin.ts` | `listPendingPayments`, `getPaymentById`, `approvePayment`, `rejectPayment` (atomic RPCs). |
| `src/lib/db/validate.ts` | `ensureMaxLength`, `ensureMaxItems` — `contracts.Validation` write-path guards. |
| `src/lib/db/index.ts` | Barrel — import everything from `@/lib/db`. |

**Conventions**
- Each helper selects its own client: **session client** (RLS) for user-scoped ops; **service-role** for the
  credit/rate-limit RPCs, `referral_events` inserts (no INSERT policy), and the admin verify/reject flow.
- Every helper throws `DbError`. The standard handler shape:

  ```ts
  export async function POST(request: Request) {
    try {
      const { user, profile } = await requireAuth();
      // ...data-access layer calls...
      return apiSuccess<GenerateResult>({ deckId, cards, creditsRemaining });
    } catch (err) {
      return handleApiError(err);
    }
  }
  ```
- Admin helpers do **no** authorization — gate behind `requireAdmin()` first.
- Atomicity: supabase-js issues one HTTP request per call (no multi-statement transactions). Multi-write
  flows that must be atomic live in `SECURITY DEFINER` Postgres functions (see §3).

---

## 3. What we did, in order

### Pass 0 — Build the layer (commit `21c5ca5`)
Created `src/lib/db/*` + `src/lib/api/errors.ts`, added Vitest (mocked Supabase), 31 tests green.

### Pass 1 — Production-readiness review → Critical + High fixes (commit `21c5ca5`)
A harsh review found three blocking issues; all fixed before push:
- **C1** — `token_balance` & `subscription_expires_at` were user-writable via the `profiles` UPDATE RLS
  policy (credit/Pro economy bypass). Added trigger guards in `protect_immutable_profile_fields()`;
  `updateOwnProfile` now builds an explicit whitelist payload.
- **C2** — `getProfileByReferralCode` returned another user's full profile (email/balances). Replaced with
  `getProfileIdByReferralCode` (returns only the id).
- **H1 (pass 1)** — admin approval was 3 non-atomic writes. Added `approve_payment`/`reject_payment`
  `SECURITY DEFINER` functions (atomic claim → tier → audit) with renewal-stacking expiry.
- **H2 (pass 1)** — `applyCardReview` was a read-modify-write race. Added `apply_card_review` RPC (atomic
  increment, SECURITY INVOKER so flashcards RLS still scopes to the caller's own card).
- **H3** — deferred: a single-transaction deck+cards+deduct RPC (`create_deck_with_cards_and_charge`) for #5.

### Pass 2 — Medium + Low fixes (commit `fd98b8d`)
- **M1 (pass 2)** — `toDbError` now maps `INVALID_AMOUNT`→400 and `USER_NOT_FOUND`→500.
- **M2** — `approve_payment` now also grants the Pro monthly allotment (30 credits) via `grant_credits` in the
  same transaction (no monthly cron yet, so approval is the only top-up point).
- **M4** — `src/lib/db/validate.ts` enforces `contracts.Validation` length/count limits in
  `insertFlashcards`/`createDeck`/`updateOwnProfile`, failing fast before any DB call.
- **L1** — dropped the interpolated `.or()` in the referral list; rely on RLS and renamed to
  `listReferralEventsForCurrentUser()`.
- **L2** — `createDeckWithCards` logs orphan-deck cleanup failures.
- **L3** — `checkRateLimit` returns `Number.MAX_SAFE_INTEGER` (not `Infinity`, which serializes to `null`).
- **M3** — generated Supabase types: **deferred** (needs Supabase auth; high churn during active schema work).

### Pass 3 — Final review → H1 + M1 fixes (this commit)
- **H1 (this pass)** — *Blind 500s.* `toDbError`'s fallback discarded the raw Postgres error and
  `handleApiError` never logged `DbError`, so DB failures on money/credit paths left no server-side trace.
  Now `toDbError` logs the raw `PostgrestError` (code+message+details) on the `USER_NOT_FOUND` and default
  branches via an `internalError()` helper, and `handleApiError` logs any `DbError` with status ≥ 500.
- **M1 (this pass)** — *Brittle error matching.* The custom `RAISE` sentinels were matched against
  `message + details`; `details` can echo user values and cause a false match. Now matched on `error.message`
  only (trimmed `startsWith`); the `message + details` scan is kept solely for our own constraint/index names
  inside the SQLSTATE branches.

---

## 4. Final production-readiness review (current state)

Harsh, M3 excluded by request. Scores out of 10.

| Category | Score | Notes |
|---|---|---|
| Correctness | 7 | Approve/credit and card-review atomic; validation added. Residual: deduct+persist non-atomic (H3, #5); empty front/back not rejected. |
| Security | 8 | `token_balance`/expiry guarded, PII narrowed, `.or` interpolation removed, length caps added. *Contingent on the schema being applied.* |
| Performance | 8 | Indexed queries, single round-trips, head counts, FK-hinted embed; validation loop negligible. |
| Scalability | 7 | Fine for target scale; rate-limit log write-amplification + advisory-lock serialization acceptable. |
| Maintainability | 7 | Clear modules, JSDoc, 60 tests; still `as` casts (M3 deferred) and our own sentinel/constraint string matching. |
| Error handling | 7 | Central `handleApiError`, typed `DbError`, no leaks; 5xx now logged with the raw cause (H1 fixed). |
| Edge cases | 7 | Renewal stacking, `Infinity`, lost-update race, validation all handled; residual UTF-16 `.length`, empty cards. |
| **Overall** | **~7.4** | Solid for the layer. Not code-blocked; one operational Critical + deferred items remain. |

### Critical (operational)
- **`schema.sql` is not yet applied to the live Supabase project.** Until it is run, the C1 `token_balance`
  guard is absent and `approve_payment` / `reject_payment` / `apply_card_review` don't exist (those routes
  will 500 with "function does not exist"). **This is the top action.**

### High (deferred)
- **No automated tests for the DB functions themselves.** `approve_payment` (incl. the 30-credit grant),
  `apply_card_review`, `deduct_credit`/`grant_credits`, and the RLS guards are only exercised through mocked
  TS wrappers — the SQL is unverified in CI. Recommend a pgTAP / test-database integration run.
- **deduct+persist still non-atomic (H3).** Deferred to feature #5 (generate); interim mitigation is the
  compensating delete + "deduct last". End state: `create_deck_with_cards_and_charge()` RPC.

### Medium (deferred)
- `as` casts throughout (fix = generated Supabase types, **M3**, intentionally skipped for now).
- Validation enforces max length only — empty/blank `front`/`back` still pass.

### Low (deferred)
- `.length` counts UTF-16 code units, not grapheme clusters.
- No tag de-dup / empty-tag check.
- Layer validation will overlap the eventual route-level Zod.

---

## 5. Action required & deferred work

**Action required (deployment):** re-apply `schema.sql` to the live Supabase project
(Dashboard → SQL Editor → Run). The file is an idempotent DROP-IN; functions use `CREATE OR REPLACE` and
triggers `DROP … IF EXISTS` so re-running is safe. Schema changes pending application: PR-C1 (trigger guards),
PR-H1 (`approve_payment`/`reject_payment`), PR-H2 (`apply_card_review`), PR-M2 (30-credit grant on approval).

**Verify C1 is closed** (after re-apply): with an anon-key user session, `PATCH /rest/v1/profiles?id=eq.<self>`
body `{ "token_balance": 999 }` must return a `FORBIDDEN` error and leave `token_balance` unchanged.

**Deferred backlog:** M3 (generated types), H2 (DB integration tests), H3 (atomic deck+charge for #5), and the
Low items above.

---

## 6. Test status

- **Vitest:** 60 tests across 9 files, all passing (`npx vitest run`). Supabase is mocked
  (`tests/helpers/supabase-mock.ts`); the suites cover error mapping + logging, rate-limit unwrap, RPC arg
  wiring, the deck compensation path, admin payment mapping, the C1 whitelist / C2 id-only lookup, and the
  M4 validation guards.
- **Types/lint:** `npx tsc --noEmit` and `npx eslint src/lib tests` both clean.

Roadmap: auth ✅ · database ✅ · integration layer ✅ → next is **#4 Upload PDF**.
