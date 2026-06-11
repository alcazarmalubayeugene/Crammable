import {
  ApiErrorCode,
  TierLimits,
  type CreateFlashcardRequest,
  type CreateFlashcardResult,
} from "@/lib/contracts";
import { apiFail, apiSuccess, handleApiError } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/api/csrf";
import { requireAuth } from "@/lib/auth/helpers";
import { enforceRateLimit } from "@/lib/supabase/server";
import { getDeckById, createFlashcard } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** D1 — add a user-authored card to a deck. */
export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const { user, profile } = await requireAuth();
    await enforceRateLimit(user.id, "/api/decks/[id]/flashcards");

    const { id } = await params;
    const deck = await getDeckById(id, user.id);
    if (!deck) {
      return apiFail(ApiErrorCode.FORBIDDEN, "Deck not found.", 404);
    }

    const maxCards = TierLimits[profile.subscription_tier].maxCardsPerDeck;
    if (deck.card_count >= maxCards) {
      return apiFail(
        ApiErrorCode.VALIDATION_ERROR,
        `This deck has reached the ${maxCards}-card limit for your plan.`,
        400
      );
    }

    let body: CreateFlashcardRequest;
    try {
      body = (await request.json()) as CreateFlashcardRequest;
    } catch {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Invalid request body.", 400);
    }
    const { card, cardCount } = await createFlashcard(id, user.id, {
      front: body.front ?? "",
      back: body.back ?? "",
      tags: body.tags,
      category: body.category,
    });

    return apiSuccess<CreateFlashcardResult>({ card, cardCount }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
