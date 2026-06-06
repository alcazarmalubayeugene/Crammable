import type { GeneratedCard } from "@/lib/contracts";
import { completeChatWithRetry } from "@/lib/deepseek/client";

const FLASHCARD_SYSTEM_PROMPT =
  "You create study flashcards for Philippine university students. " +
  "Return valid JSON only — no markdown fences, no prose outside the JSON. " +
  "All output (title, category names, card fronts, card backs, tags) must be in English " +
  "regardless of the language of the source document.";

function buildFlashcardUserPrompt(documentText: string, maxCards: number): string {
  return `The following text was extracted from a student's course handout (PDF, OCR, or paste).

Create up to ${maxCards} high-quality flashcards covering the most exam-relevant concepts.
Group them into logical topic categories (aim for 3–7 categories).

Return JSON in EXACTLY this shape — no other keys, no extra nesting:
{
  "title": "short descriptive deck title (English)",
  "categories": [
    {
      "name": "Category Name",
      "cards": [
        { "front": "question or term", "back": "answer or definition", "tags": ["topic"] }
      ]
    }
  ]
}

Rules:
- ALL text must be in English — translate if the source is in another language.
- Each card must have a non-empty front and back.
- tags: 0–3 short topic labels per card.
- Distribute cards across categories; do not put all cards in one category.
- Do not invent facts not supported by the source text.

--- DOCUMENT START ---
${documentText}
--- DOCUMENT END ---`;
}

interface RawCard {
  front?: string;
  back?: string;
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
          front:    card.front.trim(),
          back:     card.back.trim(),
          tags:     (card.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 5),
          category: categoryName,
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
      front:    card.front.trim(),
      back:     card.back.trim(),
      tags:     (card.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 5),
      category: "General",
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
): Promise<{ cards: GeneratedCard[]; title: string | null; model: string }> {
  const { content, model } = await completeChatWithRetry({
    system: FLASHCARD_SYSTEM_PROMPT,
    user: buildFlashcardUserPrompt(documentText, maxCards),
    responseFormat: { type: "json_object" },
  });

  const { cards, title } = parseCategorisedPayload(content, maxCards);
  return { cards, title, model };
}
