import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createSessionClient: vi.fn() }));

import { createSessionClient } from "@/lib/supabase/server";
import { applyCardReview } from "@/lib/db/flashcards";
import { DbError } from "@/lib/db/errors";

const mockedCreateSession = vi.mocked(createSessionClient);

function sessionWithRpc(rpc: ReturnType<typeof vi.fn>) {
  mockedCreateSession.mockResolvedValue({ rpc } as unknown as Awaited<ReturnType<typeof createSessionClient>>);
}

beforeEach(() => mockedCreateSession.mockReset());

describe("applyCardReview", () => {
  it("calls apply_card_review via the session client with the relative-increment args", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    sessionWithRpc(rpc);

    await applyCardReview("card-1", true, 0.42);

    expect(rpc).toHaveBeenCalledWith("apply_card_review", {
      p_card_id: "card-1",
      p_was_correct: true,
      p_difficulty: 0.42,
    });
  });

  it("throws a DbError when the RPC errors", async () => {
    sessionWithRpc(vi.fn().mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } }));
    await expect(applyCardReview("card-1", false, 0.1)).rejects.toBeInstanceOf(DbError);
  });
});
