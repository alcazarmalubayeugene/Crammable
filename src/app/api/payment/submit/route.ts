import {
  ApiErrorCode,
  ApiPaths,
  PaymentMethod,
  Pricing,
  UIMessages,
  Validation,
  type SubmitPaymentRequest,
  type SubmitPaymentResult,
} from "@/lib/contracts";
import { apiFail, apiSuccess, handleApiError } from "@/lib/api/errors";
import { requireAuth } from "@/lib/auth/helpers";
import { enforceRateLimit } from "@/lib/supabase/server";
import { createPaymentSubmission } from "@/lib/db/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    let body: SubmitPaymentRequest;
    try {
      body = (await request.json()) as SubmitPaymentRequest;
    } catch {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Invalid request body.", 400);
    }

    const { user } = await requireAuth();

    await enforceRateLimit(user.id, ApiPaths.submitPayment);

    const ref = (body.referenceNumber ?? "").trim();
    if (!Validation.referenceNumber.pattern.test(ref)) {
      return apiFail(
        ApiErrorCode.INVALID_REFERENCE_NUMBER,
        `GCash reference number must be exactly ${Validation.referenceNumber.length} digits.`,
        400,
      );
    }

    if (body.amount !== Pricing.pro.amountPhp) {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Invalid payment amount.", 400);
    }

    if (!Object.values(PaymentMethod).includes(body.paymentMethod)) {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Invalid payment method.", 400);
    }

    const submission = await createPaymentSubmission({
      userId: user.id,
      referenceNumber: ref,
      amount: body.amount,
      paymentMethod: body.paymentMethod,
    });

    return apiSuccess<SubmitPaymentResult>({
      submissionId: submission.id,
      estimatedVerificationMessage: UIMessages.verificationEta,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
