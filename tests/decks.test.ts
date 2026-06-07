import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createSessionClient: vi.fn() }));

import { createSessionClient } from "@/lib/supabase/server";
import { createDeckWithCardsAndCharge, type NewDeckInput } from "@/lib/db/decks";
import { ApiErrorCode, PdfType, type GeneratedCard } from "@/lib/contracts";
import { queryBuilder, fakeClient, type QueryResult } from "./helpers/supabase-mock";

const mockedCreateSession = vi.mocked(createSessionClient);

const input: NewDeckInput = { userId: "u1", title: "Bio 101", pdfType: PdfType.TEXT };
const cards: GeneratedCard[] = [
  { front: "Q1", back: "A1", tags: [], category: "General" },
  { front: "Q2", back: "A2", tags: [], category: "General" },
];

function clientWithRpc(rpcResult: QueryResult) {
  const client = fakeClient(queryBuilder({ data: null, error: null }), rpcResult);
  mockedCreateSession.mockResolvedValue(
    client as unknown as Awaited<ReturnType<typeof createSessionClient>>,
  );
  return client;
}

beforeEach(() => mockedCreateSession.mockReset());

describe("createDeckWithCardsAndCharge", () => {
  it("calls the atomic RPC and returns the new deck id + remaining credits", async () => {
    const client = clientWithRpc({
      data: [{ deck_id: "deck-1", credits_remaining: 2 }],
      error: null,
    });

    const result = await createDeckWithCardsAndCharge(input, cards);

    expect(result).toEqual({ deckId: "deck-1", creditsRemaining: 2 });
    expect(client.rpc).toHaveBeenCalledWith(
      "create_deck_with_cards_and_charge",
      expect.objectContaining({
        p_user_id: "u1",
        p_title: "Bio 101",
        p_pdf_type: PdfType.TEXT,
        p_cards: expect.arrayContaining([
          expect.objectContaining({ front: "Q1", back: "A1", category: "General" }),
        ]),
      }),
    );
  });

  it("translates an INSUFFICIENT_CREDITS RAISE into a typed DbError (no deck persisted)", async () => {
    clientWithRpc({ data: null, error: { code: "P0001", message: "INSUFFICIENT_CREDITS" } });

    await expect(createDeckWithCardsAndCharge(input, cards)).rejects.toMatchObject({
      code: ApiErrorCode.INSUFFICIENT_CREDITS,
      status: 402,
    });
  });
});
