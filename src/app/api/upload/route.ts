import {
  ApiErrorCode,
  ApiPaths,
  OcrThresholds,
  PdfType,
  SubscriptionTier,
  TierLimits,
  UIMessages,
  type ApiResponse,
  type UploadResult,
} from "@/lib/contracts";
import { apiFail, handleApiError } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/api/csrf";
import { PDF_EXTRACTION_TEST_MODE } from "@/lib/dev/pdf-test-mode";
import { extractTextFromPdfBuffer } from "@/lib/pdf/extract-text-server";
import { checkRateLimit, getMaxUploadPages } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PDF_MIME = "application/pdf";

/** Extra fields returned only while PDF_EXTRACTION_TEST_MODE is on. */
export type UploadTestDebug = {
  pageCount:        number;
  avgCharsPerPage:  number;
  isImagePdf:       boolean;
  imagePageCount:   number;
  imagePageNumbers: number[];
  threshold:        typeof OcrThresholds.minCharsPerPageForText;
};

function isPdfFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type === PDF_MIME || name.endsWith(".pdf");
}

export async function POST(request: Request): Promise<Response> {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    let maxPages: number = TierLimits[SubscriptionTier.FREE].maxUploadPages;
    let maxUploadMb: number = TierLimits[SubscriptionTier.FREE].maxUploadSizeMb;

    // SECURITY (audit 1.1): auth + consent + rate limit are ALWAYS enforced
    // (outside the dev-only PDF_EXTRACTION_TEST_MODE). They must never be gated
    // on whether the service-role env happens to be configured — a missing key
    // previously turned this into an open, unauthenticated PDF-parsing endpoint.
    if (!PDF_EXTRACTION_TEST_MODE) {
      // Cookie/session auth + RLS. requireAuth throws AuthError (→ 401) when
      // unauthenticated or the profile is missing; mapped by the outer catch.
      const { user, profile } = await requireAuth();

      if (!profile.consent_deepseek) {
        return apiFail(
          ApiErrorCode.CONSENT_REQUIRED,
          "You must consent to AI processing before uploading documents.",
          403,
        );
      }

      const rate = await checkRateLimit(user.id, ApiPaths.upload);
      if (!rate.allowed) {
        return apiFail(ApiErrorCode.RATE_LIMITED, UIMessages.rateLimited, 429);
      }

      maxPages = getMaxUploadPages(profile.subscription_tier);
      maxUploadMb = TierLimits[profile.subscription_tier].maxUploadSizeMb;
    }

    // SECURITY (audit 8.2): reject oversized bodies on the declared Content-Length
    // BEFORE buffering the multipart payload into memory. The precise per-file
    // check below still applies; this is the cheap pre-filter (with a small
    // multipart-overhead margin) that stops a memory-pressure DoS up front.
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > maxUploadMb * 1024 * 1024 + 1024 * 1024) {
      return apiFail(
        ApiErrorCode.FILE_TOO_LARGE,
        `File must be ${maxUploadMb} MB or smaller.`,
        413,
      );
    }

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

    if (file.size > maxUploadMb * 1024 * 1024) {
      return apiFail(
        ApiErrorCode.FILE_TOO_LARGE,
        `File must be ${maxUploadMb} MB or smaller.`,
        413,
      );
    }

    const buffer = await file.arrayBuffer();
    const extraction = await extractTextFromPdfBuffer(buffer);

    // Page count is unlimited (maxPages === Infinity) — the 10 MB file-size check
    // above is the only upload guard. The check is kept Infinity-safe so a finite
    // per-tier page cap can be reintroduced later by editing TierLimits alone.
    if (Number.isFinite(maxPages) && extraction.pageCount > maxPages) {
      return apiFail(
        ApiErrorCode.PAGE_LIMIT_EXCEEDED,
        `This PDF has ${extraction.pageCount} pages. Your plan allows up to ${maxPages} pages.`,
        400,
      );
    }

    const debug: UploadTestDebug | undefined = PDF_EXTRACTION_TEST_MODE
      ? {
          pageCount:        extraction.pageCount,
          avgCharsPerPage:  Math.round(extraction.avgCharsPerPage * 10) / 10,
          isImagePdf:       extraction.isImagePdf,
          imagePageCount:   extraction.imagePageNumbers.length,
          imagePageNumbers: extraction.imagePageNumbers,
          threshold:        OcrThresholds.minCharsPerPageForText,
        }
      : undefined;

    if (extraction.isImagePdf || !extraction.extractedText.trim()) {
      const body = {
        success:          true as const,
        path:             PdfType.OCR,
        message:          UIMessages.ocrWarning,
        partialText:      extraction.partialText,
        imagePageNumbers: extraction.imagePageNumbers,
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
    return handleApiError(err);
  }
}
