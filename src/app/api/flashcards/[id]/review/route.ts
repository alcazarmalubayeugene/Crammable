import {
  ApiErrorCode,
  type ReviewCardRequest,
  type ReviewCardResult,
} from "@/lib/contracts";
import { apiFail, apiSuccess, handleApiError } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/api/csrf";
import { requireAuth } from "@/lib/auth/helpers";
import { enforceRateLimit } from "@/lib/supabase/server";
import { getFlashcardById, applyCardReview } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// RLS on the session client scopes flashcards to their owner — a null result
// means the card is absent OR owned by someone else, both map to 404.

/**
 * POST /api/flashcards/[id]/review — study-mode "Got it" / "Review again".
 *
 * Self-reported, not graded against an answer (unlike quiz submission, there's
 * no "correct" to check), so the only client input is wasCorrect. The new
 * difficulty_score is still computed server-side from the card's current value
 * — same nudge formula submit_quiz_result() already uses — rather than trusting
 * a client-supplied score.
 */
export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const { user } = await requireAuth();
    await enforceRateLimit(user.id, "/api/flashcards/[id]/review");

    const { id } = await params;

    let body: ReviewCardRequest;
    try {
      body = (await request.json()) as ReviewCardRequest;
    } catch {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Invalid request body.", 400);
    }
    if (typeof body.wasCorrect !== "boolean") {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "wasCorrect is required.", 400);
    }

    const card = await getFlashcardById(id);
    if (!card) {
      return apiFail(ApiErrorCode.FORBIDDEN, "Flashcard not found.", 404);
    }

    const newDifficultyScore = body.wasCorrect
      ? Math.max(0, card.difficulty_score - 0.15)
      : Math.min(1, card.difficulty_score + 0.25);

    await applyCardReview(id, body.wasCorrect, newDifficultyScore);

    return apiSuccess<ReviewCardResult>({ newDifficultyScore });
  } catch (err) {
    return handleApiError(err);
  }
}
