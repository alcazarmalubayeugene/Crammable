import { ApiPaths, type AdminBugReportsListResult } from "@/lib/contracts";
import { apiSuccess, handleApiError } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/auth/helpers";
import { enforceRateLimit } from "@/lib/supabase/server";
import { listPendingBugReports } from "@/lib/db/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const { user } = await requireAdmin();

    await enforceRateLimit(user.id, ApiPaths.adminBugReports);

    const reports = await listPendingBugReports();

    return apiSuccess<AdminBugReportsListResult>({ reports });
  } catch (err) {
    return handleApiError(err);
  }
}
