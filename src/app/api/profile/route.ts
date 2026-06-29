import { type ProfileResult } from "@/lib/contracts";
import { handleApiError, apiSuccess } from "@/lib/api/errors";
import { requireAuth } from "@/lib/auth/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const { profile } = await requireAuth();
    return apiSuccess<ProfileResult>({ profile });
  } catch (err) {
    return handleApiError(err);
  }
}
