import {
  ApiErrorCode,
  ApiPaths,
  MAX_FILES_PER_UPLOAD,
  OcrThresholds,
  PdfType,
  SubscriptionTier,
  TierLimits,
  UIMessages,
  type ApiResponse,
  type MultiUploadResult,
  type PerFileUploadResult,
} from "@/lib/contracts";
import { apiFail, handleApiError } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/api/csrf";
import { PDF_EXTRACTION_TEST_MODE } from "@/lib/dev/pdf-test-mode";
import { extractTextFromPdfBuffer } from "@/lib/pdf/extract-text-server";
import { checkRateLimit, getMaxUploadPages } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Multiple files are extracted sequentially in one request — give it more
// headroom than a single-file extraction needs.
export const maxDuration = 60;

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
    // BEFORE buffering the multipart payload into memory. Sized for the worst
    // case (every slot filled at the per-file cap) since we don't know the real
    // file count until formData is parsed; the precise per-file check below
    // still applies to each individual file regardless.
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > maxUploadMb * MAX_FILES_PER_UPLOAD * 1024 * 1024 + 1024 * 1024) {
      return apiFail(
        ApiErrorCode.FILE_TOO_LARGE,
        `Files must total ${maxUploadMb * MAX_FILES_PER_UPLOAD} MB or smaller.`,
        413,
      );
    }

    const formData = await request.formData();
    const files = formData.getAll("file").filter((f): f is File => f instanceof File);

    if (files.length === 0) {
      return apiFail(
        ApiErrorCode.VALIDATION_ERROR,
        "At least one PDF file is required.",
        400,
      );
    }

    if (files.length > MAX_FILES_PER_UPLOAD) {
      return apiFail(
        ApiErrorCode.VALIDATION_ERROR,
        `You can combine up to ${MAX_FILES_PER_UPLOAD} PDFs into one deck.`,
        400,
      );
    }

    const results: PerFileUploadResult[] = [];
    const debugByFile: UploadTestDebug[] = [];

    for (const file of files) {
      if (!isPdfFile(file)) {
        return apiFail(
          ApiErrorCode.INVALID_FILE_TYPE,
          `"${file.name}" isn't a PDF. Only PDF files are supported.`,
          400,
        );
      }

      if (file.size > maxUploadMb * 1024 * 1024) {
        return apiFail(
          ApiErrorCode.FILE_TOO_LARGE,
          `"${file.name}" is larger than ${maxUploadMb} MB.`,
          413,
        );
      }

      const buffer = await file.arrayBuffer();
      const extraction = await extractTextFromPdfBuffer(buffer);

      // Page count is unlimited (maxPages === Infinity) — the 10 MB per-file size
      // check above is the only upload guard. The check is kept Infinity-safe so
      // a finite per-tier page cap can be reintroduced later by editing
      // TierLimits alone. Applied per file, same as the single-file cap was.
      if (Number.isFinite(maxPages) && extraction.pageCount > maxPages) {
        return apiFail(
          ApiErrorCode.PAGE_LIMIT_EXCEEDED,
          `"${file.name}" has ${extraction.pageCount} pages. Your plan allows up to ${maxPages} pages per file.`,
          400,
        );
      }

      if (PDF_EXTRACTION_TEST_MODE) {
        debugByFile.push({
          pageCount:        extraction.pageCount,
          avgCharsPerPage:  Math.round(extraction.avgCharsPerPage * 10) / 10,
          isImagePdf:       extraction.isImagePdf,
          imagePageCount:   extraction.imagePageNumbers.length,
          imagePageNumbers: extraction.imagePageNumbers,
          threshold:        OcrThresholds.minCharsPerPageForText,
        });
      }

      if (extraction.isImagePdf || !extraction.extractedText.trim()) {
        results.push({
          filename:         file.name,
          path:             PdfType.OCR,
          message:          UIMessages.ocrWarning,
          partialText:      extraction.partialText,
          imagePageNumbers: extraction.imagePageNumbers,
        });
        continue;
      }

      results.push({
        filename:         file.name,
        path:             PdfType.TEXT,
        extractedText:    extraction.extractedText,
        // Optional OCR top-up (option 2b): sparse pages in an otherwise-text
        // PDF are reported so the client can selectively OCR just those pages
        // without routing the whole file (or any multi-file batch) to OCR.
        partialText:      extraction.partialText,
        imagePageNumbers: extraction.imagePageNumbers,
      });
    }

    const body: ApiResponse<MultiUploadResult> & { _debug?: UploadTestDebug[] } = {
      success: true,
      files: results,
      ...(PDF_EXTRACTION_TEST_MODE ? { _debug: debugByFile } : {}),
    };
    return Response.json(body, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
