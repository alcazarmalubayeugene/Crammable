import path from "node:path";
import { pathToFileURL } from "node:url";
import { OcrThresholds } from "@/lib/contracts";

export interface PdfTextExtraction {
  pageCount:        number;
  extractedText:    string;    // all pages joined — used when isImagePdf is false
  avgCharsPerPage:  number;
  isImagePdf:       boolean;   // true when meaningful image content detected (see logic below)
  imagePageNumbers: number[];  // 1-based pages with chars < minCharsPerPageForText
  partialText:      string;    // text from non-sparse pages only — sent alongside OCR path
}

async function getPdfJs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const workerPath = path.join(
    process.cwd(),
    "node_modules",
    "pdfjs-dist",
    "legacy",
    "build",
    "pdf.worker.mjs",
  );
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  return pdfjs;
}

function pageCharCount(text: string): number {
  return text.replace(/\s+/g, "").length;
}

/**
 * Layer 1 — server-side pdfjs text extraction with per-page quality classification.
 *
 * Sparse pages (chars < minCharsPerPageForText) are flagged as imagePageNumbers so
 * the client can OCR only those pages instead of the whole document. partialText carries
 * the already-good text from non-sparse pages, ready to merge with OCR results.
 *
 * isImagePdf is decided by text sufficiency, not sparse-page count:
 *   - pageCount is 0, OR
 *   - at least one sparse page exists AND the non-sparse pages yield fewer
 *     than OcrThresholds.minCharsForTextPath characters.
 *
 * A document with a handful of sparse pages (title slide, section divider,
 * figure pages) but plenty of real text elsewhere is classified TEXT — those
 * sparse pages are returned as imagePageNumbers for an OPTIONAL per-page OCR
 * top-up, not as an all-or-nothing routing decision. This fixes the old
 * scale-blind ">= 3 sparse pages" rule that misrouted ordinary documents with
 * figures (e.g. slide decks) onto the OCR path.
 */
export async function extractTextFromPdfBuffer(
  buffer: ArrayBuffer,
): Promise<PdfTextExtraction> {
  const pdfjs = await getPdfJs();
  const data = new Uint8Array(buffer);
  const pdf = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  try {
    const pageCount = pdf.numPages;
    const pageTexts: string[] = [];
    let totalChars = 0;

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .trim();
      pageTexts.push(pageText);
      totalChars += pageCharCount(pageText);
      // Release this page's resources before loading the next one — prevents
      // per-page objects from accumulating for the lifetime of the request.
      page.cleanup();
    }

    const avgCharsPerPage = pageCount > 0 ? totalChars / pageCount : 0;

    const imagePageNumbers = pageTexts
      .map((text, i) => ({ pageNum: i + 1, chars: pageCharCount(text) }))
      .filter(({ chars }) => chars < OcrThresholds.minCharsPerPageForText)
      .map(({ pageNum }) => pageNum);

    const extractedText = pageTexts.join("\n\n").trim();

    const sparseSet = new Set(imagePageNumbers);
    const partialText = pageTexts
      .filter((_, i) => !sparseSet.has(i + 1))
      .filter(Boolean)
      .join("\n\n")
      .trim();

    // Text-sufficiency classifier (option 2b): a document is only routed to OCR
    // when it has sparse pages AND the readable text is too weak to build a deck.
    const isImagePdf =
      pageCount === 0 ||
      (imagePageNumbers.length > 0 &&
        pageCharCount(partialText) < OcrThresholds.minCharsForTextPath);

    return {
      pageCount,
      extractedText,
      avgCharsPerPage,
      isImagePdf,
      imagePageNumbers,
      partialText,
    };
  } finally {
    // Always release the document + worker, even when a page fails to parse —
    // a leaked pdfjs document would otherwise stay reachable for the rest of
    // the request while the next file in the batch loads on top of it.
    await pdf.destroy();
  }
}
