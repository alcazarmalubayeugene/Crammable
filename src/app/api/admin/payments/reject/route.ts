import { ApiErrorCode, Validation, type RejectPaymentRequest } from "@/lib/contracts";
import { apiFail, apiSuccess, handleApiError } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/api/csrf";
import { requireAdmin } from "@/lib/auth/helpers";
import { rejectPayment } from "@/lib/db/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    let body: RejectPaymentRequest;
    try {
      body = (await request.json()) as RejectPaymentRequest;
    } catch {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Invalid request body.", 400);
    }

    const { user } = await requireAdmin();

    const paymentId = (body.paymentId ?? "").trim();
    if (!paymentId) {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "paymentId is required.", 400);
    }

    const rejectionReason = (body.rejectionReason ?? "").trim();
    if (!rejectionReason) {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "rejectionReason is required.", 400);
    }

    const notes = body.notes?.trim().slice(0, Validation.adminNotes.maxLength) || undefined;

    await rejectPayment(
      user.id,
      paymentId,
      rejectionReason.slice(0, Validation.adminNotes.maxLength),
      notes
    );

    return apiSuccess({});
  } catch (err) {
    return handleApiError(err);
  }
}
