import { type DecksListResult } from "@/lib/contracts";
import { handleApiError, apiSuccess } from "@/lib/api/errors";
import { requireAuth } from "@/lib/auth/helpers";
import { listDecksForUser } from "@/lib/db/decks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const { user } = await requireAuth();
    const decks = await listDecksForUser(user.id);
    return apiSuccess<DecksListResult>({ decks });
  } catch (err) {
    return handleApiError(err);
  }
}
