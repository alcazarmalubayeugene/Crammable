import path from "node:path";
import { pathToFileURL } from "node:url";
import { OcrThresholds } from "@/lib/contracts";

export interface PdfTextExtraction {
  pageCount: number;
  extractedText: string;
  avgCharsPerPage: number;
  isImagePdf: boolean;
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
 * Layer 1 — server-side pdfjs text extraction with quality gate.
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

  const extractedText = pageTexts.join("\n\n").trim();
  const avgCharsPerPage = pageCount > 0 ? totalChars / pageCount : 0;
  const isImagePdf =
    pageCount === 0 ||
    avgCharsPerPage < OcrThresholds.minCharsPerPageForText;

  return {
    pageCount,
    extractedText,
    avgCharsPerPage,
    isImagePdf,
  };
}
