import {
  ApiErrorCode,
  ApiPaths,
  UIMessages,
  Validation,
  type ExplainAnswerRequest,
  type ExplainAnswerResult,
} from "@/lib/contracts";
import { apiFail, apiSuccess, handleApiError } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/api/csrf";
import { explainAnswer, isDeepSeekConfigured } from "@/lib/deepseek";
import { checkRateLimit } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A single short completion — far quicker than generation, but still a network
// call to DeepSeek, so give it headroom over the platform default.
export const maxDuration = 60;

/**
 * POST /api/quiz/explain — live "why" explanation for a single wrong answer.
 *
 * Fallback only: new cards carry a baked-in `correctExplanation`, so the client
 * calls this purely for cards generated before that column existed. Free (no
 * credit deducted), gated by consent + its own rate limit. No flashcardId /
 * ownership check — the question and answer text are already on the client at
 * this point in the quiz flow.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    if (!isDeepSeekConfigured()) {
      return apiFail(ApiErrorCode.AI_UNAVAILABLE, UIMessages.aiUnavailable, 503);
    }

    let body: ExplainAnswerRequest;
    try {
      body = (await request.json()) as ExplainAnswerRequest;
    } catch {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Invalid request body.", 400);
    }

    const questionText = body.questionText?.trim() ?? "";
    const correctAnswer = body.correctAnswer?.trim() ?? "";
    if (!questionText || !correctAnswer) {
      return apiFail(
        ApiErrorCode.VALIDATION_ERROR,
        "questionText and correctAnswer are required.",
        400,
      );
    }
    if (
      questionText.length > Validation.flashcard.frontMaxLength ||
      correctAnswer.length > Validation.flashcard.backMaxLength
    ) {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Question or answer is too long.", 400);
    }

    const { user, profile } = await requireAuth();

    if (!profile.consent_deepseek) {
      return apiFail(
        ApiErrorCode.CONSENT_REQUIRED,
        "You must consent to AI processing before Capy can explain answers.",
        403,
      );
    }

    const rate = await checkRateLimit(user.id, ApiPaths.explainAnswer);
    if (!rate.allowed) {
      return apiFail(ApiErrorCode.RATE_LIMITED, UIMessages.rateLimited, 429);
    }

    let explanation: string;
    try {
      ({ explanation } = await explainAnswer(questionText, correctAnswer));
    } catch (err) {
      console.error("DeepSeek explain failed:", err);
      return apiFail(ApiErrorCode.AI_UNAVAILABLE, UIMessages.aiUnavailable, 503);
    }

    return apiSuccess<ExplainAnswerResult>({ explanation });
  } catch (err) {
    return handleApiError(err);
  }
}
