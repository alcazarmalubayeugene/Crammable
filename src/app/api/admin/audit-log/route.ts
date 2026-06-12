import { ApiPaths, type AdminAuditLogResult } from "@/lib/contracts";
import { apiSuccess, handleApiError } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/auth/helpers";
import { enforceRateLimit } from "@/lib/supabase/server";
import { listAuditLog } from "@/lib/db/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const { user } = await requireAdmin();

    await enforceRateLimit(user.id, ApiPaths.adminAuditLog);

    const actions = await listAuditLog();

    return apiSuccess<AdminAuditLogResult>({ actions });
  } catch (err) {
    return handleApiError(err);
  }
}
