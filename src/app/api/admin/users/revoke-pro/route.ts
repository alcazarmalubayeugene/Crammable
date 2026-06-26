import {
  ApiErrorCode,
  type RevokeProRequest,
  type RevokeProResult,
} from "@/lib/contracts";
import { apiFail, apiSuccess, handleApiError } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/api/csrf";
import { requireAdmin } from "@/lib/auth/helpers";
import { revokeProAsAdmin } from "@/lib/db/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    let body: RevokeProRequest;
    try {
      body = (await request.json()) as RevokeProRequest;
    } catch {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Invalid request body.", 400);
    }

    const { user } = await requireAdmin();

    const userId = (body.userId ?? "").trim();
    if (!userId) {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "userId is required.", 400);
    }

    const result = await revokeProAsAdmin(user.id, userId);

    return apiSuccess<RevokeProResult>(result);
  } catch (err) {
    return handleApiError(err);
  }
}
