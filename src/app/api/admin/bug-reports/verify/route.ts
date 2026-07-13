import {
  ApiErrorCode,
  ApiPaths,
  ReferralCaps,
  ReferralEventType,
  Validation,
  type VerifyBugReportRequest,
  type VerifyBugReportResult,
} from "@/lib/contracts";
import { apiFail, apiSuccess, handleApiError } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/api/csrf";
import { requireAdmin } from "@/lib/auth/helpers";
import { enforceRateLimit } from "@/lib/supabase/server";
import { verifyBugReport } from "@/lib/db/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    let body: VerifyBugReportRequest;
    try {
      body = (await request.json()) as VerifyBugReportRequest;
    } catch {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Invalid request body.", 400);
    }

    const { user } = await requireAdmin();

    await enforceRateLimit(user.id, ApiPaths.adminVerifyBugReport);

    const reportId = (body.reportId ?? "").trim();
    if (!reportId) {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "reportId is required.", 400);
    }

    const notes = body.notes?.trim().slice(0, Validation.adminNotes.maxLength) || undefined;

    const result = await verifyBugReport(
      user.id,
      reportId,
      body.approve,
      ReferralCaps[ReferralEventType.BUG_REPORT].creditsAwarded,
      notes
    );

    return apiSuccess<VerifyBugReportResult>(result);
  } catch (err) {
    return handleApiError(err);
  }
}
