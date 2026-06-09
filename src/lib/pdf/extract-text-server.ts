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
 * isImagePdf triggers the OCR path when:
 *   - >= 3 sparse pages exist, OR
 *   - > 10% of pages are sparse
 * This catches mixed PDFs that the old average-based check missed while still sending
 * mostly-text PDFs (e.g. one blank cover page) straight through.
 */
export async function extractTextFromPdfBuffer(
  buffer: ArrayBuffer,
): Promise<PdfTextExtraction> {
  const pdfjs = await getPdfJs();
  const data = new Uint8Array(buffer);
  const pdf = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
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
  }

  const avgCharsPerPage = pageCount > 0 ? totalChars / pageCount : 0;

  const imagePageNumbers = pageTexts
    .map((text, i) => ({ pageNum: i + 1, chars: pageCharCount(text) }))
    .filter(({ chars }) => chars < OcrThresholds.minCharsPerPageForText)
    .map(({ pageNum }) => pageNum);

  const isImagePdf =
    pageCount === 0 ||
    imagePageNumbers.length >= 3 ||
    (pageCount > 0 && imagePageNumbers.length / pageCount > 0.1);

  const extractedText = pageTexts.join("\n\n").trim();

  const sparseSet = new Set(imagePageNumbers);
  const partialText = pageTexts
    .filter((_, i) => !sparseSet.has(i + 1))
    .filter(Boolean)
    .join("\n\n")
    .trim();

  return {
    pageCount,
    extractedText,
    avgCharsPerPage,
    isImagePdf,
    imagePageNumbers,
    partialText,
  };
}
