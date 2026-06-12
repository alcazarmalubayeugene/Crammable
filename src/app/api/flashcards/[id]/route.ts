import {
  ApiErrorCode,
  type DeleteFlashcardResult,
  type UpdateFlashcardRequest,
  type UpdateFlashcardResult,
} from "@/lib/contracts";
import { apiFail, apiSuccess, handleApiError } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/api/csrf";
import { requireAuth } from "@/lib/auth/helpers";
import { enforceRateLimit } from "@/lib/supabase/server";
import { updateFlashcard, deleteFlashcard } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// RLS on the session client scopes flashcards to their owner — a null/0-row
// result means the card is absent OR owned by someone else, both map to 404
// (no info leak), in a single round-trip with no separate ownership pre-check.

/** D1 — edit a card's front/back/tags/category. */
export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const { user } = await requireAuth();
    await enforceRateLimit(user.id, "/api/flashcards/[id]");

    const { id } = await params;
    let body: UpdateFlashcardRequest;
    try {
      body = (await request.json()) as UpdateFlashcardRequest;
    } catch {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Invalid request body.", 400);
    }

    const card = await updateFlashcard(id, {
      front: body.front,
      back: body.back,
      tags: body.tags,
      category: body.category,
    });
    if (!card) {
      return apiFail(ApiErrorCode.FORBIDDEN, "Flashcard not found.", 404);
    }

    return apiSuccess<UpdateFlashcardResult>({ card });
  } catch (err) {
    return handleApiError(err);
  }
}

/** D1 — delete a single card and resync the deck's card_count. */
export async function DELETE(request: Request, { params }: Ctx): Promise<Response> {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const { user } = await requireAuth();
    await enforceRateLimit(user.id, "/api/flashcards/[id]");

    const { id } = await params;
    const result = await deleteFlashcard(id);
    if (!result) {
      return apiFail(ApiErrorCode.FORBIDDEN, "Flashcard not found.", 404);
    }

    return apiSuccess<DeleteFlashcardResult>({ flashcardId: id, cardCount: result.cardCount });
  } catch (err) {
    return handleApiError(err);
  }
}
