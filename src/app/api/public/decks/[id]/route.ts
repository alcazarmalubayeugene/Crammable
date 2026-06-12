import type { NextRequest } from "next/server";
import { ApiErrorCode, type DeckDetailResult } from "@/lib/contracts";
import { handleApiError, apiSuccess, apiFail } from "@/lib/api/errors";
import { getPublicDeckWithCards } from "@/lib/db/decks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Read-only, unauthenticated deck view (B5). The "decks: anyone read public"
 * and "flashcards: anyone read of public deck" RLS policies (schema §5) let
 * the session client return this row even with no auth.uid() — only when
 * decks.is_public = true. Anything else (private deck, missing id) is a 404,
 * with no distinction so existence of private decks isn't leaked.
 */
export async function GET(_req: NextRequest, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const result = await getPublicDeckWithCards(id);
    if (!result) {
      return apiFail(ApiErrorCode.FORBIDDEN, "Deck not found.", 404);
    }
    return apiSuccess<DeckDetailResult>(result);
  } catch (err) {
    return handleApiError(err);
  }
}
