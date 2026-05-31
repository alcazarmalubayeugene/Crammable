import {
  ApiErrorCode,
  // ApiPaths,
  // GenerationMode,
  PdfType,
  // SubscriptionTier,
  // TableNames,
  // TierLimits,
  UIMessages,
  type ApiResponse,
  type GenerateRequest,
  type GenerateResult,
  // type GeneratedCard,
} from "@/lib/contracts";
import { apiFail } from "@/lib/api/errors";
import { PDF_EXTRACTION_TEST_MODE } from "@/lib/dev/pdf-test-mode";
// import { isExtractedTextEmpty, truncateToMaxInputTokens } from "@/lib/text/truncate";
// Supabase — disabled for PDF test mode
// import {
//   checkRateLimit,
//   createServiceClient,
//   getProfileForUser,
//   getUserFromRequest,
// } from "@/lib/supabase/server";
// import { EnvKeys } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── DeepSeek — disabled for PDF test mode ─────────────────────────────────────
// interface DeepSeekCardPayload {
//   front: string;
//   back: string;
//   tags?: string[];
// }
//
// async function generateCardsWithDeepSeek(
//   text: string,
//   maxCards: number,
// ): Promise<GeneratedCard[]> { ... }

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
      receivedPdfType?: PdfType;
      extractedTextPreview?: string;
    } = {
      success: true,
      _testMode: true,
      note: "Generate disabled in PDF_EXTRACTION_TEST_MODE — no DeepSeek, database, or credits.",
      deckId: "test-mode-no-deck",
      cards: [],
      creditsRemaining: 0,
      receivedPdfType: body?.pdfType,
      extractedTextPreview: body?.extractedText?.slice(0, 500),
    };
    return Response.json(result, { status: 200 });
  }

  // ── Re-enable full handler when PDF_EXTRACTION_TEST_MODE = false ────────────
  return apiFail(
    ApiErrorCode.INTERNAL_ERROR,
    "Generate route is disabled. Set PDF_EXTRACTION_TEST_MODE to false and restore the handler.",
    503,
  );

  /* ORIGINAL HANDLER — paste back when leaving test mode:
  try {
    const user = await getUserFromRequest(request);
    ...
    const { data: creditRow, error: creditError } = await supabase.rpc("deduct_credit", ...);
    ...
  } catch (err) {
    ...
  }
  */
}
