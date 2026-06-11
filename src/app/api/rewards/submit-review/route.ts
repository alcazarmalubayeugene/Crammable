import {
  ApiErrorCode,
  ApiPaths,
  Validation,
  type SubmitAppReviewRequest,
  type AppReview,
} from "@/lib/contracts";
import { apiFail, apiSuccess, handleApiError } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/api/csrf";
import { requireAuth } from "@/lib/auth/helpers";
import { enforceRateLimit } from "@/lib/supabase/server";
import { createAppReview } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    let body: SubmitAppReviewRequest;
    try {
      body = (await request.json()) as SubmitAppReviewRequest;
    } catch {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Invalid request body.", 400);
    }

    const { user } = await requireAuth();

    await enforceRateLimit(user.id, ApiPaths.submitAppReview);

    const rating = Math.trunc(body.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Rating must be between 1 and 5.", 400);
    }

    const reviewText = (body.reviewText ?? "").trim();
    if (!reviewText) {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Review text is required.", 400);
    }
    if (reviewText.length > Validation.appReview.textMaxLength) {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Review text is too long.", 400);
    }

    const review = await createAppReview(user.id, rating, reviewText);

    return apiSuccess<AppReview>(review);
  } catch (err) {
    return handleApiError(err);
  }
}
