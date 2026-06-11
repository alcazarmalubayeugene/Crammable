import {
  ApiErrorCode,
  ApiPaths,
  Validation,
  type GrantCreditsRequest,
  type GrantCreditsResult,
} from "@/lib/contracts";
import { apiFail, apiSuccess, handleApiError } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/api/csrf";
import { requireAdmin } from "@/lib/auth/helpers";
import { enforceRateLimit } from "@/lib/supabase/server";
import { grantCreditsAsAdmin } from "@/lib/db/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    let body: GrantCreditsRequest;
    try {
      body = (await request.json()) as GrantCreditsRequest;
    } catch {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Invalid request body.", 400);
    }

    const { user } = await requireAdmin();

    await enforceRateLimit(user.id, ApiPaths.adminGrantCredits);

    const userId = (body.userId ?? "").trim();
    if (!userId) {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "userId is required.", 400);
    }

    const amount = Number(body.amount);
    if (
      !Number.isInteger(amount) ||
      amount < Validation.adminCreditGrant.minAmount ||
      amount > Validation.adminCreditGrant.maxAmount
    ) {
      return apiFail(
        ApiErrorCode.VALIDATION_ERROR,
        `amount must be an integer between ${Validation.adminCreditGrant.minAmount} and ${Validation.adminCreditGrant.maxAmount}.`,
        400
      );
    }

    const notes = body.notes?.trim().slice(0, Validation.adminNotes.maxLength) || undefined;

    const newBalance = await grantCreditsAsAdmin(user.id, userId, amount, notes);

    return apiSuccess<GrantCreditsResult>({ userId, newBalance });
  } catch (err) {
    return handleApiError(err);
  }
}
