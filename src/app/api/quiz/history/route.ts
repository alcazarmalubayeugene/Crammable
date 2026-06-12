import type { NextRequest } from "next/server";
import type { QuizHistoryResult } from "@/lib/contracts";
import { apiSuccess, handleApiError } from "@/lib/api/errors";
import { requireAuth } from "@/lib/auth/helpers";
import { listQuizSessionsForUser } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** D3 — a user's completed quiz history, optionally scoped to one deck. */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { user } = await requireAuth();

    const deckId = request.nextUrl.searchParams.get("deckId") ?? undefined;
    const sessions = await listQuizSessionsForUser(user.id, deckId);

    return apiSuccess<QuizHistoryResult>({ sessions });
  } catch (err) {
    return handleApiError(err);
  }
}
