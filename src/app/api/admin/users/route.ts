import { ApiPaths, type AdminUsersListResult } from "@/lib/contracts";
import { apiSuccess, handleApiError } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/auth/helpers";
import { enforceRateLimit } from "@/lib/supabase/server";
import { listUsers } from "@/lib/db/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const { user } = await requireAdmin();

    await enforceRateLimit(user.id, ApiPaths.adminUsers);

    const search = new URL(request.url).searchParams.get("search")?.trim() || undefined;
    const users = await listUsers(search);

    return apiSuccess<AdminUsersListResult>({ users });
  } catch (err) {
    return handleApiError(err);
  }
}
