import {
  ApiErrorCode,
  // ApiPaths,
  MAX_UPLOAD_SIZE_MB,
  OcrThresholds,
  PdfType,
  SubscriptionTier,
  TierLimits,
  UIMessages,
  type ApiResponse,
  type UploadResult,
} from "@/lib/contracts";
import { apiFail, genericInternalError } from "@/lib/api/errors";
import { PDF_EXTRACTION_TEST_MODE } from "@/lib/dev/pdf-test-mode";
import { extractTextFromPdfBuffer } from "@/lib/pdf/extract-text-server";
// Supabase — disabled for PDF test mode
// import {
//   checkRateLimit,
//   getMaxUploadPages,
//   getProfileForUser,
//   getUserFromRequest,
// } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PDF_MIME = "application/pdf";
const MAX_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

/** Extra fields returned only while PDF_EXTRACTION_TEST_MODE is on. */
export type UploadTestDebug = {
  pageCount: number;
  avgCharsPerPage: number;
  isImagePdf: boolean;
  threshold: typeof OcrThresholds.minCharsPerPageForText;
};

function isPdfFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type === PDF_MIME || name.endsWith(".pdf");
}

export async function POST(request: Request): Promise<Response> {
  try {
    // ── Supabase / auth / rate limit (re-enable when PDF_EXTRACTION_TEST_MODE = false) ──
    // const user = await getUserFromRequest(request);
    // if (!user) {
    //   return apiFail(ApiErrorCode.UNAUTHORIZED, "Please sign in to upload a document.", 401);
    // }
    // const profile = await getProfileForUser(user.id);
    // if (!profile) {
    //   return apiFail(ApiErrorCode.UNAUTHORIZED, "Profile not found. Please sign in again.", 401);
    // }
    // if (!profile.consent_deepseek) {
    //   return apiFail(ApiErrorCode.CONSENT_REQUIRED, "You must consent to AI processing before uploading documents.", 403);
    // }
    // const rate = await checkRateLimit(user.id, ApiPaths.upload);
    // if (!rate.allowed) {
    //   return apiFail(ApiErrorCode.RATE_LIMITED, UIMessages.rateLimited, 429);
    // }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return apiFail(
        ApiErrorCode.VALIDATION_ERROR,
        "A PDF file is required.",
        400,
      );
    }

    if (!isPdfFile(file)) {
      return apiFail(
        ApiErrorCode.INVALID_FILE_TYPE,
        "Only PDF files are supported.",
        400,
      );
    }

    const maxUploadMb = TierLimits[SubscriptionTier.FREE].maxUploadSizeMb;
    if (file.size > MAX_BYTES) {
      return apiFail(
        ApiErrorCode.FILE_TOO_LARGE,
        `File must be ${maxUploadMb} MB or smaller.`,
        400,
      );
    }

    const buffer = await file.arrayBuffer();
    const extraction = await extractTextFromPdfBuffer(buffer);

    const maxPages = PDF_EXTRACTION_TEST_MODE
      ? TierLimits[SubscriptionTier.FREE].maxUploadPages
      : TierLimits[SubscriptionTier.FREE].maxUploadPages;
    // When re-enabling Supabase: use getMaxUploadPages(profile.subscription_tier)

    if (extraction.pageCount > maxPages) {
      return apiFail(
        ApiErrorCode.PAGE_LIMIT_EXCEEDED,
        `This PDF has ${extraction.pageCount} pages. Max ${maxPages} pages (test mode: free tier).`,
        400,
      );
    }

    const debug: UploadTestDebug | undefined = PDF_EXTRACTION_TEST_MODE
      ? {
          pageCount: extraction.pageCount,
          avgCharsPerPage: Math.round(extraction.avgCharsPerPage * 10) / 10,
          isImagePdf: extraction.isImagePdf,
          threshold: OcrThresholds.minCharsPerPageForText,
        }
      : undefined;

    if (extraction.isImagePdf || !extraction.extractedText.trim()) {
      const body = {
        success: true as const,
        path: PdfType.OCR,
        message: UIMessages.ocrWarning,
        ...(debug ? { _debug: debug } : {}),
      };
      return Response.json(body, { status: 200 });
    }

    const body: ApiResponse<UploadResult> & { _debug?: UploadTestDebug } = {
      success: true,
      path: PdfType.TEXT,
      extractedText: extraction.extractedText,
      ...(debug ? { _debug: debug } : {}),
    };
    return Response.json(body, { status: 200 });
  } catch (err) {
    console.error("POST /api/upload failed:", err);
    return genericInternalError();
  }
}
