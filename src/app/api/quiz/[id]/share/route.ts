import type { NextRequest } from "next/server";
import { ApiErrorCode, type ShareQuizResultResult } from "@/lib/contracts";
import { apiFail, apiSuccess, handleApiError } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/api/csrf";
import { requireAuth } from "@/lib/auth/helpers";
import { enforceRateLimit } from "@/lib/supabase/server";
import { getQuizSession, setQuizSessionPublic } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Slug is [id] (not [sessionId]) so it matches the sibling quiz/[id] route —
// Next.js requires one slug name per dynamic path level. The id IS the quiz
// session id; the public URL stays /api/quiz/<id>/share.
type Ctx = { params: Promise<{ id: string }> };

/**
 * Toggle public sharing of a quiz result (shareable results). Mirrors the deck
 * share route (/api/decks/[id]/share) — owner-only, rate-limited — minus the
 * referral-credit grant (sharing a score earns no credits). POST makes it public,
 * DELETE makes it private; both return the resulting is_public state.
 */
async function setShared(request: Request, sessionId: string, isPublic: boolean): Promise<Response> {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const { user } = await requireAuth();
  await enforceRateLimit(user.id, "/api/quiz/[id]/share");

  // getQuizSession is RLS-scoped to the owner, so a missing OR not-owned id both
  // resolve to null → 404 with no ownership leak.
  const session = await getQuizSession(sessionId);
  if (!session) {
    return apiFail(ApiErrorCode.FORBIDDEN, "Result not found.", 404);
  }

  const updated = await setQuizSessionPublic(sessionId, isPublic);

  return apiSuccess<ShareQuizResultResult>({
    isPublic: updated?.is_public ?? isPublic,
  });
}

export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    return await setShared(request, id, true);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    return await setShared(req, id, false);
  } catch (err) {
    return handleApiError(err);
  }
}
