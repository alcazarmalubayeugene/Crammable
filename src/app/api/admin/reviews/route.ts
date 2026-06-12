import { ApiPaths, type AdminReviewsListResult } from "@/lib/contracts";
import { apiSuccess, handleApiError } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/auth/helpers";
import { enforceRateLimit } from "@/lib/supabase/server";
import { listPendingAppReviews } from "@/lib/db/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const { user } = await requireAdmin();

    await enforceRateLimit(user.id, ApiPaths.adminReviews);

    const reviews = await listPendingAppReviews();

    return apiSuccess<AdminReviewsListResult>({ reviews });
  } catch (err) {
    return handleApiError(err);
  }
}
