import { ApiPaths } from "@/lib/contracts";
import { apiSuccess, handleApiError } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/api/csrf";
import { requireAuth } from "@/lib/auth/helpers";
import { enforceRateLimit } from "@/lib/supabase/server";
import { deleteAccount } from "@/lib/db/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const { user } = await requireAuth();

    await enforceRateLimit(user.id, ApiPaths.accountDelete);

    await deleteAccount(user.id);

    return apiSuccess<Record<string, never>>({});
  } catch (err) {
    return handleApiError(err);
  }
}
