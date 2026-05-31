---
description: 
alwaysApply: true
---

@AGENTS.md

# CLAUDE.md — Crammable Backend

Guidance for Claude Code (and humans) working on the Crammable backend. Read this before touching API routes, the database, or anything that talks to DeepSeek.

Crammable is a flashcard app for Philippine students: upload a PDF → AI generates flashcards → quiz yourself. Next.js (App Router) on Vercel, Supabase (Postgres + Auth + Storage + RLS), DeepSeek for generation. Payments are manual GCash with admin verification.

---

## 0. The one rule that overrides everything

**`contracts.ts` is the single source of truth. `schema.sql` is the canonical database.** If code and the master document disagree, code wins. If code and `contracts.ts` disagree, `contracts.ts` wins and the code is the bug.

Concretely, never hardcode a value that already lives in `contracts.ts`:

- App name → `App.name` (never the literal `"Crammable"` in a handler)
- Table names → `TableNames.*` (never raw strings in `.from()`)
- Route + API paths → `Routes.*` and `ApiPaths.*` (never literal `/api/...`)
- Env var names → `EnvKeys.*` (never literal `process.env.DEEPSEEK_API_KEY`)
- User-facing copy → `UIMessages.*`
- Limits, pricing, caps, thresholds → `TierLimits`, `Pricing`, `ReferralCaps`, `RateLimits`, `OcrThresholds`

When the schema changes, update `contracts.ts` **first**, then migrate the DB, then adapt the code. The flow is contract → schema → code, never the reverse.

---

## 1. API contract — every route handler

Wrap every response in `ApiResponse<T>`:

```ts
// Success
const body: ApiResponse<GenerateResult> = { success: true, ...result };
return Response.json(body, { status: 200 });

// Failure — always a typed code, never a bare string
return Response.json(
  { success: false, error: { code: ApiErrorCode.INSUFFICIENT_CREDITS, message: UIMessages.outOfCredits } },
  { status: 402 }
);
```

Rules:
- The `error.code` must be a member of `ApiErrorCode`. Don't invent codes.
- `error.message` is shown to users — keep it human, never leak stack traces, SQL, or DeepSeek internals.
- Request bodies and response shapes must match the interfaces in `contracts.ts` (`GenerateRequest`, `SubmitPaymentRequest`, etc.). If you need a new shape, add it to `contracts.ts` first.

The error codes already cover the real cases: `UNAUTHORIZED`, `FORBIDDEN`, `CONSENT_REQUIRED`, `INSUFFICIENT_CREDITS`, `DECK_LIMIT_REACHED`, `PAGE_LIMIT_EXCEEDED`, `FILE_TOO_LARGE`, `INVALID_FILE_TYPE`, `RATE_LIMITED`, `INVALID_REFERRAL_CODE`, `REFERRAL_CAP_REACHED`, `SELF_REFERRAL`, `INVALID_REFERENCE_NUMBER`, `PAYMENT_ALREADY_PENDING`, `AI_UNAVAILABLE`, `EXTRACTION_FAILED`, `VALIDATION_ERROR`, `INTERNAL_ERROR`. Map each failure to the right one.

---

## 2. Database — do privileged work through RPCs, never by hand

The schema has 9 tables (`profiles`, `decks`, `flashcards`, `quiz_sessions`, `quiz_answers`, `payment_submissions`, `referral_events`, `rate_limit_log`, `admin_action_log`) and 7 functions. **Use the functions — do not re-implement their logic in TypeScript.**

- **Credits — always `deduct_credit()`.** It is atomic and raises `INSUFFICIENT_CREDITS` when the balance is too low. Never read the balance, subtract in JS, and write it back — that races and lets users double-spend. Catch the raised error and return `ApiErrorCode.INSUFFICIENT_CREDITS`.
- **Rate limiting — always `check_rate_limit()`** (SECURITY DEFINER RPC) at the top of every AI-facing handler. It both checks *and* logs the request, so `rate_limit_log` writes happen inside it — clients have no direct access to that table. Limits live in `RateLimits` (`/api/upload` 5/hr, `/api/generate` 2/hr, `/api/payment/submit` 2/24h, `/api/referral/claim` 5/24h, etc.). If it returns `allowed: false`, return `RATE_LIMITED`.
- **Referrals — always `check_referral_cap()`** before crediting. Caps are enforced in the DB; don't trust a client-side count. Watch for `SELF_REFERRAL` and `REFERRAL_CAP_REACHED`.
- **Privilege escalation is blocked at the DB layer.** The `prevent_privilege_escalation()` function + `block_privilege_escalation` trigger stop any client-side update to `is_admin` or `subscription_tier`. Never try to set those from a normal authed request — tier changes happen only via the admin payment-approval path, and `is_admin` is set manually in the DB.
- New users are provisioned by `handle_new_user()` (fires on `auth.users` insert) — it creates the profile, starting credits, and referral code via `generate_unique_referral_code()`. Don't duplicate this in signup code.
- `updated_at` is maintained by `set_updated_at()` triggers — don't set it manually.

**RLS is always on.** Users read/write only their own rows. The browser uses the anon key (RLS-enforced). Server-only privileged work uses the service-role key — and only server-side. Never reach for the service-role key just to "make a query work"; that almost always means you're bypassing a policy you should be respecting.

Schema changes go through migrations that keep `schema.sql` authoritative. Don't edit tables by hand in the dashboard and let `schema.sql` rot.

---

## 3. Upload → OCR → generate pipeline

The extraction waterfall uses `OcrThresholds`, and both frontend and backend must make the *same* decision from the *same* numbers:

1. **Layer 1 — embedded text.** If avg chars/page ≥ `minCharsPerPageForText` (100), use the PDF's own text.
2. **Layer 2 — OCR.** Below that, it's an image PDF → run OCR. If majority-page Tesseract confidence < `minTesseractConfidence` (0.6) → fall through.
3. **Layer 3 — paste fallback.** Ask the user to paste text. If all three fail, return `EXTRACTION_FAILED`.

Cap forwarded content at `maxInputTokens` (40k) before calling DeepSeek. Enforce `TierLimits` server-side (free: 3 decks, 20 cards/deck, 15 pages, no deep-dive/living-decks/export) — never trust the client to respect its own tier.

---

## 4. DeepSeek + data privacy (RA 10173 — not optional)

Sending a student's document to DeepSeek is a **cross-border personal-data transfer**. Backend obligations:

- **Gate on consent.** If `consent_deepseek` is false, refuse before any forwarding and return `CONSENT_REQUIRED`. No consent, no DeepSeek call — ever.
- **Sanitise and length-cap** input before forwarding. Never forward profile PII — extracted document text only.
- **Delete the source PDF from Storage** immediately after successful extraction. Don't keep it "just in case."
- On timeout/downtime return `AI_UNAVAILABLE` gracefully, and **never deduct a credit for a failed generation.** Deduct only after a successful result.

---

## 5. Payments (manual GCash)

Pro is ₱150 (see `Pricing`). The flow is deliberately manual:

1. User submits a GCash reference. Validate it against `Validation` — a 13-digit reference (`INVALID_REFERENCE_NUMBER` otherwise). One pending submission at a time (`PAYMENT_ALREADY_PENDING`).
2. Row lands in `payment_submissions` with status `pending`.
3. An admin verifies in the GCash app, then approves/rejects via the admin routes. **Only approval flips `subscription_tier` to pro** — and that path writes an `admin_action_log` row (`admin_id` + timestamp). Never auto-activate Pro from the submit handler.

`PaymentStatus` is `pending | verified | rejected`. Don't add states without updating `contracts.ts` and the DB CHECK constraint.

---

## 6. Secrets & environment

All secrets come from env vars named in `EnvKeys` — never hardcoded, never committed. Server-only keys (`SUPABASE_SERVICE_ROLE_KEY`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`) must **never** appear in client code or anything `NEXT_PUBLIC_*`. If you're unsure whether code runs on the client, assume it does and keep secrets out.

---

## 7. Definition of done (backend change)

Before you call a backend task complete:

- [ ] `tsc` passes with no new `any` and no contract drift.
- [ ] All table refs use `TableNames`; all paths use `ApiPaths`/`Routes`; all env reads use `EnvKeys`.
- [ ] Every response is `ApiResponse<T>`; every failure maps to a real `ApiErrorCode`.
- [ ] Credit, rate-limit, and referral logic goes through the DB functions — not re-implemented in JS.
- [ ] RLS verified: a second user cannot read or write the first user's rows.
- [ ] No secret reachable from the client; service-role key used server-side only.
- [ ] If touching uploads/generation: consent gate present, source PDF deleted post-extraction, no credit charged on AI failure.

---

## 8. Commands

> Adjust to match the actual `package.json` — verify before relying on these.

```bash
npm run dev          # local dev server
npm run build        # production build (must pass before deploy)
npm run typecheck    # tsc --noEmit — run after every change
npm run lint
npx supabase start   # local Supabase stack
npx supabase db reset  # re-apply schema.sql + migrations locally
```

---

## 9. Quick "do / don't"

| Don't | Do instead |
|---|---|
| `supabase.from("profiles")` | `supabase.from(TableNames.profiles)` |
| `process.env.DEEPSEEK_API_KEY` | `process.env[EnvKeys.deepseekApiKey]` |
| Subtract credits in JS and update the row | Call `deduct_credit()` |
| Roll your own rate counter | Call `check_rate_limit()` |
| Update `is_admin` / `subscription_tier` from a user request | Admin approval path only (DB trigger blocks the rest) |
| Forward a PDF to DeepSeek without checking consent | Gate on `consent_deepseek`, else `CONSENT_REQUIRED` |
| Return `{ error: "no credits" }` | Return `{ success: false, error: { code: ApiErrorCode.INSUFFICIENT_CREDITS, ... } }` |
| Auto-activate Pro on payment submit | Wait for admin approval; log to `admin_action_log` |
