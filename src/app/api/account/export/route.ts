import { ApiPaths } from "@/lib/contracts";
import { handleApiError } from "@/lib/api/errors";
import { requireAuth } from "@/lib/auth/helpers";
import { enforceRateLimit } from "@/lib/supabase/server";
import { exportAccountData } from "@/lib/db/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Binary file download — not the standard ApiResponse<T> JSON envelope.
// Errors are still returned as ApiResponse<never> via apiFail/handleApiError.
export async function GET(): Promise<Response> {
  try {
    const { user } = await requireAuth();

    await enforceRateLimit(user.id, ApiPaths.accountExport);

    const data = await exportAccountData(user.id);

    const filename = `crammable-export-${new Date().toISOString().slice(0, 10)}.json`;

    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
