import type { NextRequest } from "next/server";
import { type DecksListResult } from "@/lib/contracts";
import { handleApiError, apiSuccess } from "@/lib/api/errors";
import { requireAuth } from "@/lib/auth/helpers";
import { listDecksForUser } from "@/lib/db/decks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { user } = await requireAuth();
    const archived = request.nextUrl.searchParams.get("archived") === "1";
    const decks = await listDecksForUser(user.id, { archived });
    return apiSuccess<DecksListResult>({ decks });
  } catch (err) {
    return handleApiError(err);
  }
}
