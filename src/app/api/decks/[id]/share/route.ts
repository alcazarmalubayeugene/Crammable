import type { NextRequest } from "next/server";
import {
  ApiErrorCode,
  ReferralCaps,
  ReferralEventType,
  toMonthKey,
  type ShareDeckResult,
} from "@/lib/contracts";
import { apiFail, apiSuccess, handleApiError } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/api/csrf";
import { requireAuth } from "@/lib/auth/helpers";
import { enforceRateLimit } from "@/lib/supabase/server";
import { getDeckById, setDeckPublic, claimSelfReferralEvent, DbError } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const { user } = await requireAuth();
    await enforceRateLimit(user.id, "/api/decks/[id]/share");

    const { id } = await params;
    const deck = await getDeckById(id);
    if (!deck) {
      return apiFail(ApiErrorCode.FORBIDDEN, "Deck not found.", 404);
    }

    const updated = await setDeckPublic(id, true);

    let creditsAwarded = 0;
    const minCards = (ReferralCaps[ReferralEventType.DECK_SHARE] as { minCards: number }).minCards;
    if (deck.card_count >= minCards) {
      try {
        await claimSelfReferralEvent(
          user.id,
          ReferralEventType.DECK_SHARE,
          ReferralCaps[ReferralEventType.DECK_SHARE].creditsAwarded,
          toMonthKey(new Date()),
          id
        );
        creditsAwarded = ReferralCaps[ReferralEventType.DECK_SHARE].creditsAwarded;
      } catch (err) {
        // REFERRAL_CAP_REACHED (monthly cap) or the once-per-deck unique index —
        // the deck still gets made public, just no additional credit.
        if (!(err instanceof DbError && err.code === ApiErrorCode.REFERRAL_CAP_REACHED)) {
          throw err;
        }
      }
    }

    return apiSuccess<ShareDeckResult>({
      isPublic: updated?.is_public ?? true,
      creditsAwarded,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx): Promise<Response> {
  try {
    const { user } = await requireAuth();
    await enforceRateLimit(user.id, "/api/decks/[id]/share");

    const { id } = await params;
    const deck = await getDeckById(id);
    if (!deck) {
      return apiFail(ApiErrorCode.FORBIDDEN, "Deck not found.", 404);
    }

    const updated = await setDeckPublic(id, false);

    return apiSuccess<ShareDeckResult>({
      isPublic: updated?.is_public ?? false,
      creditsAwarded: 0,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
