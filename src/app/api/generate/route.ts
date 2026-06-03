import {
  ApiErrorCode,
  ApiPaths,
  EnvKeys,
  GenerationMode,
  PdfType,
  SubscriptionTier,
  TableNames,
  TierLimits,
  UIMessages,
  type ApiResponse,
  type GenerateRequest,
  type GenerateResult,
} from "@/lib/contracts";
import { apiFail, genericInternalError } from "@/lib/api/errors";
import { PDF_EXTRACTION_TEST_MODE } from "@/lib/dev/pdf-test-mode";
import {
  generateFlashcardsFromText,
  isDeepSeekConfigured,
} from "@/lib/deepseek";
import { isExtractedTextEmpty, truncateToMaxInputTokens } from "@/lib/text/truncate";
import {
  checkRateLimit,
  createServiceClient,
  getProfileForUser,
  getUserFromRequest,
} from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_MAX_CARDS = 20;

function maxCardsForTier(
  tier: (typeof SubscriptionTier)[keyof typeof SubscriptionTier],
): number {
  const limit = TierLimits[tier].maxCardsPerDeck;
  return limit === Infinity ? DEFAULT_MAX_CARDS : limit;
}

function isPersistenceEnabled(): boolean {
  return Boolean(
    process.env[EnvKeys.supabaseUrl]?.trim() &&
      process.env[EnvKeys.supabaseServiceRoleKey]?.trim(),
  );
}

export async function POST(request: Request): Promise<Response> {
  if (PDF_EXTRACTION_TEST_MODE) {
    let body: GenerateRequest | null = null;
    try {
      body = (await request.json()) as GenerateRequest;
    } catch {
      /* ignore */
    }
    const result: ApiResponse<GenerateResult> & {
      _testMode: true;
      note: string;
    } = {
      success: true,
      _testMode: true,
      note: "Generate disabled in PDF_EXTRACTION_TEST_MODE.",
      deckId: "test-mode-no-deck",
      cards: [],
      creditsRemaining: 0,
    };
    return Response.json(result, { status: 200 });
  }

  try {
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

    const persist = isPersistenceEnabled();
    let userId: string | null = null;
    let maxCards = DEFAULT_MAX_CARDS;
    let creditsRemaining = 0;

    if (persist) {
      const user = await getUserFromRequest(request);
      if (!user) {
        return apiFail(
          ApiErrorCode.UNAUTHORIZED,
          "Please sign in to generate flashcards.",
          401,
        );
      }
      userId = user.id;

      const profile = await getProfileForUser(user.id);
      if (!profile) {
        return apiFail(ApiErrorCode.UNAUTHORIZED, "Profile not found.", 401);
      }

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

      maxCards = maxCardsForTier(profile.subscription_tier);
      creditsRemaining = profile.token_balance;
    }

    let cards: Awaited<ReturnType<typeof generateFlashcardsFromText>>["cards"];
    try {
      const result = await generateFlashcardsFromText(extractedText, maxCards);
      cards = result.cards;
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

    if (!persist || !userId) {
      const preview: ApiResponse<GenerateResult> = {
        success: true,
        deckId: `preview-${Date.now()}`,
        cards,
        creditsRemaining: 0,
      };
      return Response.json(preview, { status: 200 });
    }

    const supabase = createServiceClient();
    const title =
      body.title?.trim().slice(0, 100) ||
      `Deck ${new Date().toISOString().slice(0, 10)}`;

    const { data: deck, error: deckError } = await supabase
      .from(TableNames.decks)
      .insert({
        user_id: userId,
        title,
        card_count: cards.length,
        generation_mode: body.generationMode ?? GenerationMode.STANDARD,
        pdf_type: pdfType,
      })
      .select("id")
      .single();

    if (deckError || !deck) {
      console.error("Deck insert failed:", deckError?.message);
      return genericInternalError();
    }

    const flashcardRows = cards.map((card) => ({
      deck_id: deck.id,
      user_id: userId,
      front: card.front,
      back: card.back,
      tags: card.tags,
    }));

    const { error: cardsError } = await supabase
      .from(TableNames.flashcards)
      .insert(flashcardRows);

    if (cardsError) {
      console.error("Flashcard insert failed:", cardsError.message);
      await supabase.from(TableNames.decks).delete().eq("id", deck.id);
      return genericInternalError();
    }

    const { data: creditRow, error: creditError } = await supabase.rpc("deduct_credit", {
      p_user_id: userId,
    });

    if (creditError) {
      const code = creditError.message?.includes("INSUFFICIENT_CREDITS")
        ? ApiErrorCode.INSUFFICIENT_CREDITS
        : ApiErrorCode.INTERNAL_ERROR;
      await supabase.from(TableNames.decks).delete().eq("id", deck.id);
      const status = code === ApiErrorCode.INSUFFICIENT_CREDITS ? 402 : 500;
      return apiFail(
        code,
        code === ApiErrorCode.INSUFFICIENT_CREDITS
          ? "You do not have enough credits to generate a deck."
          : UIMessages.genericError,
        status,
      );
    }

    creditsRemaining =
      typeof creditRow === "number"
        ? creditRow
        : Number(
            (creditRow as { token_balance?: number })?.token_balance ??
              creditsRemaining - 1,
          );

    const result: ApiResponse<GenerateResult> = {
      success: true,
      deckId: deck.id,
      cards,
      creditsRemaining,
    };
    return Response.json(result, { status: 200 });
  } catch (err) {
    console.error("POST /api/generate failed:", err);
    return genericInternalError();
  }
}
