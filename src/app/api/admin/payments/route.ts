import { ApiPaths, type AdminPaymentsListResult } from "@/lib/contracts";
import { apiSuccess, handleApiError } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/auth/helpers";
import { enforceRateLimit } from "@/lib/supabase/server";
import { listPendingPayments } from "@/lib/db/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const { user } = await requireAdmin();

    await enforceRateLimit(user.id, ApiPaths.adminPayments);

    const submissions = await listPendingPayments();

    return apiSuccess<AdminPaymentsListResult>({ submissions });
  } catch (err) {
    return handleApiError(err);
  }
}
