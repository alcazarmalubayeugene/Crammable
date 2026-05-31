import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createSessionClient: vi.fn() }));
vi.mock("@/lib/db/flashcards");

import { createSessionClient } from "@/lib/supabase/server";
import { insertFlashcards } from "@/lib/db/flashcards";
import { createDeckWithCards, type NewDeckInput } from "@/lib/db/decks";
import { PdfType, type Flashcard, type GeneratedCard } from "@/lib/contracts";
import { queryBuilder, fakeClient, type QueryBuilderMock } from "./helpers/supabase-mock";

const mockedCreateSession = vi.mocked(createSessionClient);
const mockedInsertFlashcards = vi.mocked(insertFlashcards);

const deckRow = { id: "deck-1", user_id: "u1", title: "Bio 101", card_count: 0 };
const input: NewDeckInput = { userId: "u1", title: "Bio 101", pdfType: PdfType.TEXT };
const cards: GeneratedCard[] = [
  { front: "Q1", back: "A1", tags: [] },
  { front: "Q2", back: "A2", tags: [] },
];

function useBuilder(): QueryBuilderMock {
  const builder = queryBuilder({ data: deckRow, error: null });
  mockedCreateSession.mockResolvedValue(fakeClient(builder) as unknown as Awaited<ReturnType<typeof createSessionClient>>);
  return builder;
}

beforeEach(() => {
  mockedCreateSession.mockReset();
  mockedInsertFlashcards.mockReset();
});

describe("createDeckWithCards", () => {
  it("persists the deck, inserts cards, and syncs card_count on success", async () => {
    const builder = useBuilder();
    const inserted = cards.map((c, i) => ({ id: `c${i}`, ...c })) as unknown as Flashcard[];
    mockedInsertFlashcards.mockResolvedValue(inserted);

    const result = await createDeckWithCards(input, cards);

    expect(result.cards).toBe(inserted);
    expect(result.deck.card_count).toBe(cards.length);
    expect(builder.insert).toHaveBeenCalledOnce(); // the deck insert
    expect(builder.update).toHaveBeenCalled(); // card_count sync
    expect(builder.delete).not.toHaveBeenCalled(); // no compensation on success
  });

  it("deletes the orphan deck (compensation) and rethrows when card insert fails", async () => {
    const builder = useBuilder();
    mockedInsertFlashcards.mockRejectedValue(new Error("card insert boom"));

    await expect(createDeckWithCards(input, cards)).rejects.toThrow("card insert boom");

    // compensating cleanup must have run against the created deck
    expect(builder.delete).toHaveBeenCalledOnce();
    expect(builder.eq).toHaveBeenCalledWith("id", deckRow.id);
    // card_count must NOT be updated when the cards never landed
    expect(builder.update).not.toHaveBeenCalled();
  });
});
