import type { NextRequest } from "next/server";
import { ApiErrorCode, type ArchiveDeckResult } from "@/lib/contracts";
import { apiFail, apiSuccess, handleApiError } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/api/csrf";
import { requireAuth } from "@/lib/auth/helpers";
import { enforceRateLimit } from "@/lib/supabase/server";
import { getDeckById, setDeckArchived } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Ctx): Promise<Response> {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const { user } = await requireAuth();
    await enforceRateLimit(user.id, "/api/decks/[id]/archive");

    const { id } = await params;
    const deck = await getDeckById(id, user.id);
    if (!deck) {
      return apiFail(ApiErrorCode.FORBIDDEN, "Deck not found.", 404);
    }

    const updated = await setDeckArchived(id, true);
    return apiSuccess<ArchiveDeckResult>({ archived: updated?.archived_at != null });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(request: NextRequest, { params }: Ctx): Promise<Response> {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const { user } = await requireAuth();
    await enforceRateLimit(user.id, "/api/decks/[id]/archive");

    const { id } = await params;
    const deck = await getDeckById(id, user.id);
    if (!deck) {
      return apiFail(ApiErrorCode.FORBIDDEN, "Deck not found.", 404);
    }

    const updated = await setDeckArchived(id, false);
    return apiSuccess<ArchiveDeckResult>({ archived: updated?.archived_at != null });
  } catch (err) {
    return handleApiError(err);
  }
}
