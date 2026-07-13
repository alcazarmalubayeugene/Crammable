import {
  ApiErrorCode,
  ApiPaths,
  Validation,
  type SubmitBugReportRequest,
  type BugReport,
  type BugReportSeverity,
} from "@/lib/contracts";
import { apiFail, apiSuccess, handleApiError } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/api/csrf";
import { requireAuth } from "@/lib/auth/helpers";
import { enforceRateLimit } from "@/lib/supabase/server";
import { createBugReport } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_SEVERITIES = ["low", "medium", "high", "critical"];

export async function POST(request: Request): Promise<Response> {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    let body: SubmitBugReportRequest;
    try {
      body = (await request.json()) as SubmitBugReportRequest;
    } catch {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Invalid request body.", 400);
    }

    const { user } = await requireAuth();

    await enforceRateLimit(user.id, ApiPaths.submitBugReport);

    const title = (body.title ?? "").trim();
    if (!title) {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "A short title is required.", 400);
    }
    if (title.length > Validation.bugReport.titleMaxLength) {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Title is too long.", 400);
    }

    const description = (body.description ?? "").trim();
    if (!description) {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "A description is required.", 400);
    }
    if (description.length > Validation.bugReport.descriptionMaxLength) {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Description is too long.", 400);
    }

    if (!VALID_SEVERITIES.includes(body.severity)) {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Invalid severity.", 400);
    }

    const pageUrl = body.pageUrl?.trim().slice(0, 500) || null;

    const report = await createBugReport(
      user.id,
      title,
      description,
      body.severity as BugReportSeverity,
      pageUrl
    );

    return apiSuccess<BugReport>(report);
  } catch (err) {
    return handleApiError(err);
  }
}
