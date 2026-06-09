import {
  ApiErrorCode,
  ApiPaths,
  UIMessages,
  type SubmitQuizResultData,
  type SubmitQuizResultRequest,
} from "@/lib/contracts";
import { handleApiError, apiSuccess, apiFail } from "@/lib/api/errors";
import { requireAuth } from "@/lib/auth/helpers";
import { checkRateLimit } from "@/lib/supabase/server";
import { submitQuizResult } from "@/lib/db/quiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const { user } = await requireAuth();

    const rate = await checkRateLimit(user.id, ApiPaths.submitQuizResult);
    if (!rate.allowed) {
      return apiFail(ApiErrorCode.RATE_LIMITED, UIMessages.rateLimited, 429);
    }

    let body: SubmitQuizResultRequest;
    try {
      body = (await request.json()) as SubmitQuizResultRequest;
    } catch {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Invalid request body.", 400);
    }

    const { sessionId, answers } = body;

    if (!sessionId || !Array.isArray(answers) || answers.length === 0) {
      return apiFail(
        ApiErrorCode.VALIDATION_ERROR,
        "sessionId and at least one answer are required.",
        400,
      );
    }

    // One atomic, idempotent RPC: locks the session, re-checks completed_at,
    // inserts the answers, updates each card's review stats, and finalises the
    // session. A missing/not-owned session surfaces as DbError(FORBIDDEN, 404);
    // an already-submitted session as DbError(VALIDATION_ERROR, 409) — both via
    // handleApiError. The difficulty-nudge formula now lives in the RPC (§4.13).
    const { correctCount, totalQuestions, scorePercent } = await submitQuizResult(
      sessionId,
      answers,
    );

    // Living Deck (TODO 8) is not yet wired — always false for now.
    return apiSuccess<SubmitQuizResultData>({
      scorePercent,
      correctCount,
      totalQuestions,
      livingDeckRefreshTriggered: false,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
