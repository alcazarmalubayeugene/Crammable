import type { GeneratedCard } from "@/lib/contracts";
import { completeChatWithRetry } from "@/lib/deepseek/client";

const FLASHCARD_SYSTEM_PROMPT =
  "You create study flashcards for Philippine university students. " +
  "Return valid JSON only, no markdown fences.";

function buildFlashcardUserPrompt(documentText: string, maxCards: number): string {
  return `The following text was extracted from a student's course handout (PDF text layer, OCR, or paste).

Create up to ${maxCards} high-quality flashcards covering the most exam-relevant concepts.

Return JSON in exactly this shape:
{"cards":[{"front":"question or term","back":"answer or definition","tags":["topic"]}]}

Rules:
- Use clear, concise wording suitable for cramming.
- Each card must have non-empty front and back.
- tags: 0–3 short topic labels per card.
- Do not invent facts not supported by the source text.

--- DOCUMENT START ---
${documentText}
--- DOCUMENT END ---`;
}

interface DeepSeekCardsPayload {
  cards?: { front?: string; back?: string; tags?: string[] }[];
}

function parseCardsPayload(raw: string, maxCards: number): GeneratedCard[] {
  const parsed = JSON.parse(raw) as DeepSeekCardsPayload;
  const cards = parsed.cards ?? [];
  return cards
    .filter((c) => c.front?.trim() && c.back?.trim())
    .slice(0, maxCards)
    .map((c) => ({
      front: c.front!.trim(),
      back: c.back!.trim(),
      tags: (c.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 5),
    }));
}

/**
 * Send extracted document text to DeepSeek and return structured flashcards.
 */
export async function generateFlashcardsFromText(
  documentText: string,
  maxCards: number,
): Promise<{ cards: GeneratedCard[]; model: string }> {
  const { content, model } = await completeChatWithRetry({
    system: FLASHCARD_SYSTEM_PROMPT,
    user: buildFlashcardUserPrompt(documentText, maxCards),
    responseFormat: { type: "json_object" },
  });

  const cards = parseCardsPayload(content, maxCards);
  return { cards, model };
}
