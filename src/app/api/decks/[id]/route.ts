import type { NextRequest } from "next/server";
import {
  ApiErrorCode,
  Validation,
  type DeckDetailResult,
  type RenameDeckRequest,
  type RenameDeckResult,
} from "@/lib/contracts";
import { handleApiError, apiSuccess, apiFail } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/api/csrf";
import { requireAuth } from "@/lib/auth/helpers";
import { enforceRateLimit } from "@/lib/supabase/server";
import { getDeckWithCards, deleteDeck, renameDeck } from "@/lib/db/decks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// RLS on the session client scopes all queries to auth.uid() — decks belonging
// to other users are invisible (null), so 404 is correct in both the
// "doesn't exist" and "belongs to another user" cases. No ownership info leaks.

export async function GET(_req: NextRequest, { params }: Ctx): Promise<Response> {
  try {
    const { user } = await requireAuth();
    const { id } = await params;
    const result = await getDeckWithCards(id, user.id);
    if (!result) {
      return apiFail(ApiErrorCode.FORBIDDEN, "Deck not found.", 404);
    }
    return apiSuccess<DeckDetailResult>(result);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: Ctx): Promise<Response> {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const { user } = await requireAuth();
    await enforceRateLimit(user.id, "/api/decks/[id]");
    const { id } = await params;

    let body: RenameDeckRequest;
    try {
      body = (await request.json()) as RenameDeckRequest;
    } catch {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Invalid request body.", 400);
    }
    const title = body.title?.trim() ?? "";
    if (!title) {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Deck title is required.", 400);
    }
    if (title.length > Validation.deck.titleMaxLength) {
      return apiFail(
        ApiErrorCode.VALIDATION_ERROR,
        `Deck title must be ${Validation.deck.titleMaxLength} characters or fewer.`,
        400
      );
    }

    const deck = await renameDeck(id, title);
    if (!deck) {
      return apiFail(ApiErrorCode.FORBIDDEN, "Deck not found.", 404);
    }
    return apiSuccess<RenameDeckResult>({ deck });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx): Promise<Response> {
  try {
    await requireAuth();
    const { id } = await params;
    // RLS scopes the delete to the caller's own rows, so a 0-row result means the
    // deck is absent OR owned by someone else — both map to 404 (no info leak),
    // in a single round-trip with no separate ownership pre-check.
    const deleted = await deleteDeck(id);
    if (deleted === 0) {
      return apiFail(ApiErrorCode.FORBIDDEN, "Deck not found.", 404);
    }
    return apiSuccess({ deckId: id });
  } catch (err) {
    return handleApiError(err);
  }
}
