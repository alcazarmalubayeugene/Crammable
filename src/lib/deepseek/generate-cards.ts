import type { Flashcard, GeneratedCard, GenerationMode } from "@/lib/contracts";
import { GenerationMode as GenerationModeEnum } from "@/lib/contracts";
import { completeChatWithRetry } from "@/lib/deepseek/client";

const FLASHCARD_SYSTEM_PROMPT =
  "You create study flashcards for Philippine university students. " +
  "Return valid JSON only — no markdown fences, no prose outside the JSON. " +
  "All output (title, category names, card fronts, card backs, distractors, tags) must be in English " +
  "regardless of the language of the source document.";

function buildFlashcardUserPrompt(
  documentText: string,
  maxCards: number,
  generationMode: GenerationMode,
): string {
  const isDeepDive = generationMode === GenerationModeEnum.DEEP_DIVE;

  const depthInstructions = isDeepDive
    ? `This is a DEEP DIVE pass — go beyond surface recall:
- Write the "back" as a single clear answer sentence (under 25 words) — thorough but quiz-ready, not an essay. Do not begin with "It is" or repeat the front text.
- Where relevant, write the "explanation" (2-4 sentences) covering WHY/HOW, a contrast with a related concept, or a common pitfall.
- Aim to use the full ${maxCards}-card budget if the source material supports it.`
    : `Write the "back" as a single, direct answer sentence (under 20 words) — as if it will appear as one radio-button choice in a multiple-choice quiz. Do not begin with "It is" or repeat the front text.`;

  return `The following text was extracted from a student's course handout (PDF, OCR, or paste).

Create up to ${maxCards} high-quality flashcards covering the most exam-relevant concepts.
Group them into logical topic categories (aim for 3–7 categories).

${depthInstructions}

For each card, write:
1. "explanation" (1-3 sentences): WHY the "back" answer is correct — teach the reasoning, not restate the definition. Shown only when the student answers wrong.
2. "distractors": exactly 3 plausible-but-wrong answer strings for multiple-choice use.
   - Same format and similar length as "back" — they appear alongside the correct answer as MC options.
   - Target misconceptions or near-misses a real student might pick.
   - Never make a distractor obviously absurd, a paraphrase of "back", or completely unrelated to the topic.
   - Each distractor must be distinct from the others and from "back".

Return JSON in EXACTLY this shape — no other keys, no extra nesting:
{
  "title": "short descriptive deck title (English)",
  "categories": [
    {
      "name": "Category Name",
      "cards": [
        {
          "front": "question or term",
          "back": "correct answer (concise, quiz-ready)",
          "explanation": "why the answer is correct",
          "distractors": ["plausible wrong answer 1", "plausible wrong answer 2", "plausible wrong answer 3"],
          "tags": ["topic"]
        }
      ]
    }
  ]
}

Rules:
- ALL text must be in English — translate if the source is in another language.
- Each card must have a non-empty front, back, explanation, and exactly 3 distractors.
- tags: 0–3 short topic labels per card.
- Distribute cards across categories; do not put all cards in one category.
- Do not invent facts not supported by the source text.
- "back" must be a complete, naturally readable answer — a noun phrase or 1–2 sentences. Do NOT write a raw formula, equation, math expression, digit sequence, or code snippet as the sole content of "back". If the concept is inherently mathematical, express the answer in words and include the formula as a supplement (e.g. "Kinetic energy equals one-half mass times velocity squared (KE = ½mv²)", not just "½mv²").
- Every "back" answer must make sense as a multiple-choice option: a student who doesn't know the answer should be able to read it, understand what is being claimed, and decide whether it is plausible.

--- DOCUMENT START ---
${documentText}
--- DOCUMENT END ---`;
}

interface RawCard {
  front?: string;
  back?: string;
  explanation?: string;
  distractors?: string[];
  tags?: string[];
}

interface RawCategory {
  name?: string;
  cards?: RawCard[];
}

interface DeepSeekCategorisedPayload {
  title?: string;
  categories?: RawCategory[];
  // Fallback: older flat format {"cards":[...]} in case the model ignores the schema.
  cards?: RawCard[];
}

function parseCategorisedPayload(raw: string, maxCards: number): {
  cards: GeneratedCard[];
  title: string | null;
} {
  const parsed = JSON.parse(raw) as DeepSeekCategorisedPayload;
  const title = parsed.title?.trim() || null;
  const cards: GeneratedCard[] = [];

  if (Array.isArray(parsed.categories) && parsed.categories.length > 0) {
    for (const category of parsed.categories) {
      if (cards.length >= maxCards) break;
      const categoryName = category.name?.trim() || "General";
      for (const card of category.cards ?? []) {
        if (cards.length >= maxCards) break;
        if (!card.front?.trim() || !card.back?.trim()) continue;
        cards.push({
          front:       card.front.trim(),
          back:        card.back.trim(),
          explanation: card.explanation?.trim() ?? "",
          distractors: (card.distractors ?? []).map((d) => d.trim()).filter(Boolean).slice(0, 3),
          tags:        (card.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 5),
          category:    categoryName,
        });
      }
    }
    return { cards, title };
  }

  // Fallback: flat {"cards":[...]} — model ignored the category schema.
  // Assign all cards to "General" so the shape is still valid.
  for (const card of parsed.cards ?? []) {
    if (cards.length >= maxCards) break;
    if (!card.front?.trim() || !card.back?.trim()) continue;
    cards.push({
      front:       card.front.trim(),
      back:        card.back.trim(),
      explanation: card.explanation?.trim() ?? "",
      distractors: (card.distractors ?? []).map((d) => d.trim()).filter(Boolean).slice(0, 3),
      tags:        (card.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 5),
      category:    "General",
    });
  }
  return { cards, title };
}

/**
 * Send extracted document text to DeepSeek and return categorised flashcards.
 *
 * Cards are grouped by topic category so the Living Deck can target weak areas
 * within a specific category rather than across the whole deck.
 * All output is enforced to be English via the system prompt.
 */
export async function generateFlashcardsFromText(
  documentText: string,
  maxCards: number,
  generationMode: GenerationMode = GenerationModeEnum.STANDARD,
): Promise<{ cards: GeneratedCard[]; title: string | null; model: string }> {
  const { content, model } = await completeChatWithRetry({
    system: FLASHCARD_SYSTEM_PROMPT,
    user: buildFlashcardUserPrompt(documentText, maxCards, generationMode),
    responseFormat: { type: "json_object" },
  });

  const { cards, title } = parseCategorisedPayload(content, maxCards);
  return { cards, title, model };
}

const REINFORCEMENT_SYSTEM_PROMPT =
  "You create study flashcards for Philippine university students. " +
  "Return valid JSON only — no markdown fences, no prose outside the JSON. " +
  "All output (category names, card fronts, card backs, distractors, tags) must be in English " +
  "regardless of the language of the source material.";

function buildReinforcementUserPrompt(weakCards: Flashcard[], maxCards: number): string {
  const cardList = weakCards
    .map((c, i) => `${i + 1}. [${c.category || "General"}] Q: ${c.front}\n   A: ${c.back}`)
    .join("\n");

  return `A student is struggling with the following flashcards from their study deck.
For each one, write a NEW flashcard that tests the SAME underlying concept from a
different angle (e.g. a different phrasing, a related example, or an application of
the idea) — do not just repeat the original wording.

Generate up to ${maxCards} new flashcards total, one per topic below where possible.

For each card, write:
1. "back": a single, direct answer sentence (under 20 words) — concise and quiz-ready.
2. "explanation" (1-3 sentences): WHY the answer is correct — teach the reasoning, not restate.
3. "distractors": exactly 3 plausible-but-wrong answer strings for multiple-choice use.
   - Same format and similar length as "back".
   - Target misconceptions or near-misses a real student might pick.
   - Never obviously absurd, a paraphrase of "back", or completely off-topic.

Struggling cards:
${cardList}

Return JSON in EXACTLY this shape — no other keys, no extra nesting:
{
  "categories": [
    {
      "name": "Category Name",
      "cards": [
        {
          "front": "question or term",
          "back": "correct answer (concise, quiz-ready)",
          "explanation": "why the answer is correct",
          "distractors": ["plausible wrong answer 1", "plausible wrong answer 2", "plausible wrong answer 3"],
          "tags": ["topic"]
        }
      ]
    }
  ]
}

Rules:
- ALL text must be in English.
- Each card must have a non-empty front, back, explanation, and exactly 3 distractors.
- tags: 0–3 short topic labels per card.
- Do not invent facts not supported by the original cards.
- Reuse the same category names as the struggling cards where it makes sense.
- "back" must be a complete, naturally readable answer — a noun phrase or 1–2 sentences. Do NOT write a raw formula, equation, math expression, digit sequence, or code snippet as the sole content of "back". If the concept is inherently mathematical, express the answer in words and include the formula as a supplement (e.g. "Force equals mass times acceleration (F = ma)", not just "F = ma").
- Every "back" answer must make sense as a multiple-choice option: a student who doesn't know the answer should be able to read it, understand what is being claimed, and decide whether it is plausible.`;
}

/**
 * Living Deck refresh (B1): generate new-angle flashcards covering the same
 * concepts as the student's weakest cards. Reuses the categorised JSON shape
 * so the result can be inserted via insertReinforcementCardsAndCharge() the
 * same way as a normal generation pass.
 */
export async function generateReinforcementCards(
  weakCards: Flashcard[],
  maxCards: number,
): Promise<{ cards: GeneratedCard[]; model: string }> {
  const { content, model } = await completeChatWithRetry({
    system: REINFORCEMENT_SYSTEM_PROMPT,
    user: buildReinforcementUserPrompt(weakCards, maxCards),
    responseFormat: { type: "json_object" },
  });

  const { cards } = parseCategorisedPayload(content, maxCards);
  return { cards, model };
}

const EXPLAIN_SYSTEM_PROMPT =
  "You are Capy, a friendly study-buddy capybara who teaches Philippine university " +
  "students. A student just answered a quiz question wrong. Explain in 1-3 short " +
  "sentences WHY the given answer is correct — not just a restatement of it. Plain " +
  "English, no markdown, no preamble like \"Sure!\" — just the explanation itself.";

function buildExplainUserPrompt(questionText: string, correctAnswer: string): string {
  return `Question: ${questionText}\nCorrect answer: ${correctAnswer}\n\nExplain why this is the correct answer.`;
}

/**
 * Live fallback "why" explanation for a single wrong quiz answer. Used only for
 * cards generated before the baked-in `explanation` field existed (QuizQuestion
 * .correctExplanation is null). Best-effort: one retry, then give up rather than
 * make the student wait on a free bonus.
 */
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
  return { explanation: content.trim(), model };
}
