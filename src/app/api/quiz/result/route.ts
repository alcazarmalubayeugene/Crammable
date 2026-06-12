import {
  ApiErrorCode,
  ApiPaths,
  LivingDeck,
  SubscriptionTier,
  TierLimits,
  UIMessages,
  type SubmitQuizResultData,
  type SubmitQuizResultRequest,
} from "@/lib/contracts";
import { handleApiError, apiSuccess, apiFail } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/api/csrf";
import { requireAuth } from "@/lib/auth/helpers";
import { checkRateLimit } from "@/lib/supabase/server";
import {
  submitQuizResult,
  getQuizSession,
  getDeckById,
  markLivingDeckRefreshTriggered,
  getWeakCardsForDeck,
  insertReinforcementCardsAndCharge,
} from "@/lib/db";
import { generateReinforcementCards } from "@/lib/deepseek/generate-cards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const { user, profile } = await requireAuth();

    const rate = await checkRateLimit(user.id, ApiPaths.submitQuizResult);
    if (!rate.allowed) {
      return apiFail(ApiErrorCode.RATE_LIMITED, UIMessages.rateLimited, 429);
    }

    let body: SubmitQuizResultRequest;
    try {
      body = (await request.json()) as SubmitQuizResultRequest;
    } catch {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Invalid request body.", 400);
    }

    const { sessionId, answers } = body;

    if (!sessionId || !Array.isArray(answers) || answers.length === 0) {
      return apiFail(
        ApiErrorCode.VALIDATION_ERROR,
        "sessionId and at least one answer are required.",
        400,
      );
    }

    // One atomic, idempotent RPC: locks the session, re-checks completed_at,
    // inserts the answers, updates each card's review stats, and finalises the
    // session. A missing/not-owned session surfaces as DbError(FORBIDDEN, 404);
    // an already-submitted session as DbError(VALIDATION_ERROR, 409) — both via
    // handleApiError. The difficulty-nudge formula now lives in the RPC (§4.13).
    const { correctCount, totalQuestions, scorePercent } = await submitQuizResult(
      sessionId,
      answers,
    );

    // Living Deck (B1): on a weak result, Pro users with consent get a
    // reinforcement refresh; everyone else sees an upsell instead.
    let livingDeckRefreshTriggered = false;
    let reinforcedCardCount: number | undefined;
    let upsellMessage: string | undefined;

    if (scorePercent < LivingDeck.scorePercentThreshold) {
      if (profile.subscription_tier === SubscriptionTier.PRO && profile.consent_deepseek) {
        try {
          const session = await getQuizSession(sessionId);
          const deck = session ? await getDeckById(session.deck_id, user.id) : null;
          // Respect the tier's per-deck card cap — a refresh must never push a
          // deck past TierLimits.pro.maxCardsPerDeck. `room` is how many new
          // reinforcement cards still fit; skip entirely when the deck is full.
          const maxCards = TierLimits[profile.subscription_tier].maxCardsPerDeck;
          const room = deck
            ? Math.max(0, Math.min(LivingDeck.maxWeakCardsPerRefresh, maxCards - deck.card_count))
            : 0;
          if (session && deck && room > 0) {
            const weakCards = await getWeakCardsForDeck(session.deck_id);
            if (weakCards.length > 0) {
              const { cards } = await generateReinforcementCards(weakCards, room);
              const capped = cards.slice(0, room);
              if (capped.length > 0) {
                const { insertedCount } = await insertReinforcementCardsAndCharge(
                  user.id,
                  session.deck_id,
                  capped,
                );
                await markLivingDeckRefreshTriggered(sessionId);
                livingDeckRefreshTriggered = true;
                reinforcedCardCount = insertedCount;
              }
            }
          }
        } catch {
          // AI failure or INSUFFICIENT_CREDITS — the RPC rolls back any partial
          // insert, so no credit is charged. Silently skip the refresh.
        }
      } else {
        upsellMessage = UIMessages.livingDeckUpsell;
      }
    }

    return apiSuccess<SubmitQuizResultData>({
      scorePercent,
      correctCount,
      totalQuestions,
      livingDeckRefreshTriggered,
      ...(reinforcedCardCount !== undefined ? { reinforcedCardCount } : {}),
      ...(upsellMessage !== undefined ? { upsellMessage } : {}),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
