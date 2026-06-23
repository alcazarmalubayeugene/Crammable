import type { NextRequest } from "next/server";
import { ApiErrorCode, type PublicQuizResult } from "@/lib/contracts";
import { handleApiError, apiSuccess, apiFail } from "@/lib/api/errors";
import { getPublicQuizResult } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sessionId: string }> };

/**
 * Read-only, unauthenticated quiz-result view (shareable results). Backed by the
 * get_public_quiz_result() SECURITY DEFINER RPC (schema §4.16), which returns the
 * narrow display projection only for is_public = true completed sessions — so a
 * private deck's title is shown for a shared score, but nothing else leaks. A
 * private, missing, or unfinished session is a 404, with no distinction so the
 * existence of private results isn't leaked (same shape as the public deck route).
 */
export async function GET(_req: NextRequest, { params }: Ctx): Promise<Response> {
  try {
    const { sessionId } = await params;
    const result = await getPublicQuizResult(sessionId);
    if (!result) {
      return apiFail(ApiErrorCode.FORBIDDEN, "Result not found.", 404);
    }
    // The public viewer reads `data.result`, so the payload nests under `result`.
    return apiSuccess<{ result: PublicQuizResult }>({ result });
  } catch (err) {
    return handleApiError(err);
  }
}
