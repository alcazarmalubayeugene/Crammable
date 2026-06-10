import {
  ApiErrorCode,
  Validation,
  type ApprovePaymentRequest,
  type ApprovePaymentResult,
} from "@/lib/contracts";
import { apiFail, apiSuccess, handleApiError } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/auth/helpers";
import { approvePayment } from "@/lib/db/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    let body: ApprovePaymentRequest;
    try {
      body = (await request.json()) as ApprovePaymentRequest;
    } catch {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Invalid request body.", 400);
    }

    const { user } = await requireAdmin();

    const paymentId = (body.paymentId ?? "").trim();
    if (!paymentId) {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "paymentId is required.", 400);
    }

    const notes = body.notes?.trim().slice(0, Validation.adminNotes.maxLength) || undefined;

    const result = await approvePayment(user.id, paymentId, notes);

    return apiSuccess<ApprovePaymentResult>(result);
  } catch (err) {
    return handleApiError(err);
  }
}
