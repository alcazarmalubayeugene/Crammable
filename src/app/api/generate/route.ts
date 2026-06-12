import {
  ApiErrorCode,
  ApiPaths,
  GenerationMode,
  PdfType,
  SubscriptionTier,
  TierLimits,
  UIMessages,
  type ApiResponse,
  type GenerateRequest,
  type GenerateResult,
} from "@/lib/contracts";
import { apiFail, handleApiError } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/api/csrf";
import {
  generateFlashcardsFromText,
  isDeepSeekConfigured,
} from "@/lib/deepseek";
import { isExtractedTextEmpty, truncateToMaxInputTokens } from "@/lib/text/truncate";
import { checkRateLimit } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/helpers";
import { countDecksForUser, createDeckWithCardsAndCharge } from "@/lib/db/decks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// DeepSeek generation can take tens of seconds. Set the function budget
// explicitly so the platform default (as low as 10s on some plans) doesn't kill
// the request mid-call. Keep DEEPSEEK_REQUEST_TIMEOUT_MS comfortably under this.
export const maxDuration = 60;

function maxCardsForTier(
  tier: (typeof SubscriptionTier)[keyof typeof SubscriptionTier],
): number {
  return TierLimits[tier].maxCardsPerDeck;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    if (!isDeepSeekConfigured()) {
      return apiFail(ApiErrorCode.AI_UNAVAILABLE, UIMessages.aiUnavailable, 503);
    }

    let body: GenerateRequest;
    try {
      body = (await request.json()) as GenerateRequest;
    } catch {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Invalid request body.", 400);
    }

    const extractedText = truncateToMaxInputTokens(body.extractedText?.trim() ?? "");
    if (isExtractedTextEmpty(extractedText)) {
      return apiFail(
        ApiErrorCode.EXTRACTION_FAILED,
        UIMessages.ocrFallbackPrompt,
        422,
      );
    }

    const pdfType = body.pdfType ?? PdfType.TEXT;
    if (!Object.values(PdfType).includes(pdfType)) {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Invalid pdfType.", 400);
    }

    // Cookie/session auth + RLS (same pattern as decks/quiz). Throws AuthError
    // (→ 401) when unauthenticated or the profile row is missing; the outer
    // catch maps it via handleApiError.
    const { user, profile } = await requireAuth();

    if (!profile.consent_deepseek) {
      return apiFail(
        ApiErrorCode.CONSENT_REQUIRED,
        "You must consent to AI processing before generating cards.",
        403,
      );
    }

    const rate = await checkRateLimit(user.id, ApiPaths.generate);
    if (!rate.allowed) {
      return apiFail(ApiErrorCode.RATE_LIMITED, UIMessages.rateLimited, 429);
    }

    // Fail fast before the DeepSeek call — deductCredit() enforces this atomically
    // too, but checking here avoids burning an API call when balance is clearly 0.
    if (profile.token_balance <= 0) {
      return apiFail(ApiErrorCode.INSUFFICIENT_CREDITS, UIMessages.outOfCredits, 402);
    }

    const maxDecks = TierLimits[profile.subscription_tier].maxDecks;
    if (maxDecks !== Infinity) {
      const deckCount = await countDecksForUser(user.id);
      if (deckCount >= maxDecks) {
        return apiFail(ApiErrorCode.DECK_LIMIT_REACHED, UIMessages.deckLimitReached, 403);
      }
    }

    const maxCards = maxCardsForTier(profile.subscription_tier);

    // Deep Dive (B2) is Pro-only — never trust the client's tier. A free user
    // requesting deep_dive is silently downgraded to standard rather than
    // erroring, since the request itself is otherwise valid.
    const generationMode: GenerationMode =
      body.generationMode === GenerationMode.DEEP_DIVE && TierLimits[profile.subscription_tier].deepDive
        ? GenerationMode.DEEP_DIVE
        : GenerationMode.STANDARD;

    let cards: Awaited<ReturnType<typeof generateFlashcardsFromText>>["cards"];
    let aiTitle: string | null = null;
    try {
      const result = await generateFlashcardsFromText(extractedText, maxCards, generationMode);
      cards = result.cards;
      aiTitle = result.title;
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message === "DEEPSEEK_NOT_CONFIGURED") {
        return apiFail(ApiErrorCode.AI_UNAVAILABLE, UIMessages.aiUnavailable, 503);
      }
      console.error("DeepSeek generation failed:", err);
      return apiFail(ApiErrorCode.AI_UNAVAILABLE, UIMessages.aiUnavailable, 503);
    }

    if (cards.length === 0) {
      return apiFail(
        ApiErrorCode.EXTRACTION_FAILED,
        UIMessages.ocrFallbackPrompt,
        422,
      );
    }

    const title =
      body.title?.trim().slice(0, 100) ||
      aiTitle?.slice(0, 100) ||
      `Deck ${new Date().toISOString().slice(0, 10)}`;

    // Persist the deck + cards and charge one credit in a single transaction.
    // On INSUFFICIENT_CREDITS the whole thing rolls back (no orphan deck, no
    // charge) and surfaces as DbError(402) → handleApiError. The fail-fast
    // balance check above already covers the common case before the DeepSeek
    // call; this is the atomic guard against a concurrent spend.
    const { deckId, creditsRemaining } = await createDeckWithCardsAndCharge(
      {
        userId: user.id,
        title,
        generationMode,
        pdfType,
      },
      cards,
    );

    const result: ApiResponse<GenerateResult> = {
      success: true,
      deckId,
      cards,
      creditsRemaining,
    };
    return Response.json(result, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
