import {
  ApiErrorCode,
  ReferralCaps,
  ReferralEventType,
  Validation,
  type VerifyReviewRequest,
  type VerifyReviewResult,
} from "@/lib/contracts";
import { apiFail, apiSuccess, handleApiError } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/api/csrf";
import { requireAdmin } from "@/lib/auth/helpers";
import { verifyAppReview } from "@/lib/db/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    let body: VerifyReviewRequest;
    try {
      body = (await request.json()) as VerifyReviewRequest;
    } catch {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Invalid request body.", 400);
    }

    const { user } = await requireAdmin();

    const reviewId = (body.reviewId ?? "").trim();
    if (!reviewId) {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "reviewId is required.", 400);
    }

    const notes = body.notes?.trim().slice(0, Validation.adminNotes.maxLength) || undefined;

    const result = await verifyAppReview(
      user.id,
      reviewId,
      body.approve,
      ReferralCaps[ReferralEventType.APP_REVIEW].creditsAwarded,
      notes
    );

    return apiSuccess<VerifyReviewResult>(result);
  } catch (err) {
    return handleApiError(err);
  }
}
