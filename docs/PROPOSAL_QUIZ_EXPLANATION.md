# Proposal: AI "teaching lesson" on wrong quiz answers

*Status:* Proposal (built, then reverted from the frontend session — see Why below) · *Audience:* Backend dev / backend-tasked Claude · *Author:* Frontend session, 2026-06-18→21

---

## 1. What this is

Right now, when a student answers a quiz question wrong, Crammable just shows the correct answer. This proposal adds a one-line "why" explanation underneath it — Capy explaining the *reasoning*, not just restating the answer. Example:

> Q: What is the powerhouse of the cell?
> Wrong answer given: Nucleus
> **Correct answer:** Mitochondria
> *Capy's lesson:* Mitochondria generate ATP through cellular respiration — the nucleus stores genetic material but doesn't produce energy itself.

This was fully built and working during the 2026-06-18→20 frontend session, then **reverted on 2026-06-21** — not because it didn't work or wasn't wanted, but because building it required editing `contracts.ts` and `schema.sql`, which this project's doc-ownership boundary marks backend-owned. The frontend session shouldn't have touched those files solo, so everything was rolled back cleanly (confirmed via `tsc --noEmit` + the full test suite, both green after the revert). The idea, the prompt design, and the working code are all real and tested — they're just not in the live codebase anymore. This doc is that handoff.

---

## 2. Why it's worth doing — the actual benefit

- **Pedagogical, not cosmetic.** Crammable's whole pitch is cramming *effectively*, not just memorizing. Showing *why* an answer is correct (not just *what* it is) is the difference between a flashcard app and a tutor. This is the single most "tutor-like" feature in the app once it exists.
- **Makes the product feel more interactive.** Right now a wrong answer is a dead end — see the answer, move on. A short explanation turns every miss into a tiny teaching moment, which is exactly the "Capy, the calm study buddy" brand promise (see `docs/DESIGN_PROPOSAL_CAPY_CALM.md`).
- **Free to the student either way.** Whether baked-in or live, this was designed to never charge a Capycoin — it rides on the DeepSeek call the student already paid for (generation) or a separate free, rate-limited call. It's a retention/quality feature, not a monetization one.

## 3. The actual DeepSeek token-cost tradeoff (already worked through once — worth keeping)

Two designs were considered; here's the reasoning so it doesn't need to be re-derived:

**Option A — live call per wrong answer** (`POST /api/quiz/explain`, called only when the student actually gets a question wrong):
- Pro: zero cost on decks that nobody ever misses a card on; simplest schema (no new column).
- Con: Living Deck reinforcement + repeated quiz retries mean the *same card* can be missed multiple times across multiple sessions — each miss re-pays the full system-prompt + completion cost for an explanation that would have been identical every time.

**Option B — baked in at generation time** (one extra field per card, generated once, in the same DeepSeek call that already makes the card):
- Pro: paid once per card, ever, regardless of how many times it's missed later. Marginal cost is small — one extra sentence-ish field riding on a generation call that's already happening — versus Option A's repeated full round-trips (system prompt + network latency) every time a retry hits the same weak card, which is the exact scenario Living Deck is designed to produce.
- Con: every generated card gets an explanation even if the student never gets it wrong (slightly larger generation payload/cost up front, slightly larger `flashcards` rows).

**Decision made (and recommended again here): Option B, baked-in, with Option A as a fallback only for old cards generated before this field existed.** The fallback matters operationally — it means this can ship without a backfill migration; pre-existing decks just transparently use the live call until they're regenerated, and new decks get the free, instant version. If you do build this, keep the hybrid — it's what made this both cheap *and* incrementally deployable.

---

## 4. The code, as built (frontend session) — copy/adapt as needed

All of this was reverted out of the live tree. It's reproduced here verbatim from the working version so it doesn't need to be re-derived from scratch — copy it in if you want to pick this up, or use it as a reference for your own version. File paths are the original ones; some line numbers will have shifted since.

### `src/lib/contracts.ts` additions

```ts
// ApiPaths
explainAnswer: "/api/quiz/explain",

// RateLimits
[ApiPaths.explainAnswer]: { windowMinutes: 60, maxRequests: 30 }, // free, but still a real DeepSeek call

// Validation.flashcard
explanationMaxLength: 1000, // "why" lesson shown when a quiz answer is wrong

// Flashcard interface — add alongside front/back
explanation: string | null; // null = pre-existing card; frontend falls back to a live explain call only when null

// GeneratedCard interface — add alongside front/back
explanation: string; // "why" lesson — generated once here, reused for free on every future wrong answer

// QuizQuestion interface — add alongside correctAnswer
correctExplanation: string | null; // pre-generated "why" — null falls back to a live ApiPaths.explainAnswer call

// New request/response shapes for POST /api/quiz/explain
export interface ExplainAnswerRequest {
  questionText: string;  // <= Validation.flashcard.frontMaxLength
  correctAnswer: string; // <= Validation.flashcard.backMaxLength
}
export interface ExplainAnswerResult {
  explanation: string;
}
```

### `schema.sql` additions

```sql
-- flashcards table
explanation TEXT, -- "Why" lesson for the quiz wrong-answer banner. NULL for cards
                   -- generated before this column existed — frontend falls back to a
                   -- live DeepSeek explain call only when this is NULL.
```

In both `create_deck_with_cards_and_charge()` and `insert_reinforcement_cards_and_charge()`, add `explanation` to the insert column list and value list:

```sql
INSERT INTO public.flashcards (deck_id, user_id, front, back, explanation, tags, category, is_reinforcement)
SELECT v_deck_id,
       p_user_id,
       c->>'front',
       c->>'back',
       NULLIF(c->>'explanation', ''),
       COALESCE(...),
       ...
```

(`p_cards` JSONB shape becomes `{ front, back, explanation, tags, category }` for both RPCs.)

### `src/lib/deepseek/generate-cards.ts` — prompt + parsing additions

Add to the main generation prompt (and the Living Deck reinforcement prompt the same way):

```
For each card, also write a SEPARATE "explanation" (1-3 sentences): why the "back" answer is
correct, not just a restatement of it. This is shown to the student ONLY if they answer the
quiz question wrong — it should teach the underlying reasoning, not repeat the definition.
```

And update the JSON shape example to include `"explanation": "why the answer is correct"` per card, plus the rule "Each card must have a non-empty front, back, and explanation." Parsing: map `explanation: card.explanation?.trim() ?? ""` alongside `front`/`back`/`tags`/`category` in both branches of `parseCategorisedPayload()`.

Live fallback function, for cards that predate the baked-in field:

```ts
const EXPLAIN_SYSTEM_PROMPT =
  "You are Capy, a friendly study-buddy capybara who teaches Philippine university " +
  "students. A student just answered a quiz question wrong. Explain in 1-3 short " +
  "sentences WHY the given answer is correct — not just a restatement of it. Plain " +
  "English, no markdown, no preamble like \"Sure!\" — just the explanation itself.";

function buildExplainUserPrompt(questionText: string, correctAnswer: string): string {
  return `Question: ${questionText}\nCorrect answer: ${correctAnswer}\n\nExplain why this is the correct answer.`;
}

export async function explainAnswer(
  questionText: string,
  correctAnswer: string,
): Promise<{ explanation: string; model: string }> {
  const { content, model } = await completeChatWithRetry({
    system: EXPLAIN_SYSTEM_PROMPT,
    user: buildExplainUserPrompt(questionText, correctAnswer),
    temperature: 0.4,
    maxRetries: 1, // best-effort UI enhancement — fail fast rather than make the student wait
  });
  return { explanation: content, model };
}
```

Re-export `explainAnswer` from `src/lib/deepseek/index.ts` alongside the existing generation exports.

### `src/app/api/quiz/explain/route.ts` — new route

POST handler, mirroring the shape of every other DeepSeek-facing route in this codebase:
1. `assertSameOrigin()` (CSRF).
2. `isDeepSeekConfigured()` check → `AI_UNAVAILABLE` if not.
3. Parse + validate body against `Validation.flashcard.frontMaxLength` / `backMaxLength`.
4. `requireAuth()` + check `consent_deepseek` → `CONSENT_REQUIRED` if false. **No flashcardId/ownership check needed** — the question/answer text is already visible to the client at this point in the quiz flow.
5. `checkRateLimit(user.id, ApiPaths.explainAnswer)` → `RATE_LIMITED` if exceeded.
6. Call `explainAnswer(questionText, correctAnswer)`.
7. `apiSuccess<ExplainAnswerResult>({ explanation })`.

No credit deduction — this is free, gated only by consent + its own rate limit, same pattern as every other AI-facing route's non-monetary safeguards.

### `src/lib/db/decks.ts` / `src/lib/db/flashcards.ts`

Add `ensureMaxLength(card.explanation, Validation.flashcard.explanationMaxLength, "Card explanation")` to the per-card validation loop in `createDeckWithCardsAndCharge()` and `insertReinforcementCardsAndCharge()`, and add `explanation: c.explanation` to the `p_cards` mapping sent to each RPC.

### `src/app/api/quiz/[id]/route.ts`

In `buildQuestions()`, add `correctExplanation: card.explanation` to both the `MULTIPLE_CHOICE` and `IDENTIFICATION` returned `QuizQuestion` objects.

### Frontend integration (`src/app/quiz/[deckId]/page.tsx`)

```ts
const [explanation, setExplanation] = useState<string | null>(null);
const [explanationLoading, setExplanationLoading] = useState(false);

async function fetchExplanation(questionText: string, correctAnswer: string) {
  setExplanationLoading(true);
  try {
    const res = await fetch(ApiPaths.explainAnswer, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionText, correctAnswer }),
    });
    const data = (await res.json()) as { success: boolean } & Partial<ExplainAnswerResult>;
    if (data.success && data.explanation) setExplanation(data.explanation);
  } catch {
    // silent — this is a free bonus, never something the student waits on or sees an error for
  } finally {
    setExplanationLoading(false);
  }
}

// in submitAnswer(), after grading a wrong answer:
if (!correct) {
  if (q.correctExplanation) {
    setExplanation(q.correctExplanation);       // instant, baked-in, no loading state
  } else {
    fetchExplanation(q.questionText, q.correctAnswer); // old card, live fallback
  }
}
```

Reset both pieces of state in `startQuiz()` and `nextQuestion()` alongside the other per-question state. Render the explanation (or a "Capy is thinking…" loading state) inside the existing wrong-answer feedback banner.

---

## 5. What we'd need from you if you want to pick this up

- Sign-off that `contracts.ts`/`schema.sql` get these specific additions (or your own version of them) — that's the actual boundary this proposal exists because of.
- A real migration for the `flashcards.explanation` column (the version above never reached the live Supabase project, so there's no existing data/migration debt to account for — it's a clean addition).
- Everything else above is copy-pasteable as a starting point; happy to walk through any of it or adjust the frontend wiring to match however you'd rather shape the backend side.
