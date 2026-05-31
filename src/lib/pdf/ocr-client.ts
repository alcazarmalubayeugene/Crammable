"use client";

import { OcrThresholds } from "@/lib/contracts";
import type { RenderedPdfPage } from "@/lib/pdf/render-pages-client";

export interface PageOcrResult {
  pageNumber: number;
  text: string;
  /** Normalised 0–1 confidence from Tesseract (0–100 raw). */
  confidence: number;
}

export interface OcrRunResult {
  pages: PageOcrResult[];
  extractedText: string;
  /** True when a majority of pages fall below minTesseractConfidence → Layer 3. */
  needsPasteFallback: boolean;
}

function normaliseConfidence(raw: number): number {
  return raw > 1 ? raw / 100 : raw;
}

/**
 * Layer 2 — Tesseract.js OCR per rendered page with majority confidence gate.
 */
export async function runOcrOnPages(
  renderedPages: RenderedPdfPage[],
  onProgress?: (current: number, total: number) => void,
): Promise<OcrRunResult> {
  const Tesseract = await import("tesseract.js");
  const worker = await Tesseract.createWorker("eng");
  const pages: PageOcrResult[] = [];
  const total = renderedPages.length;

  try {
    for (let i = 0; i < total; i++) {
      const { pageNumber, canvas } = renderedPages[i]!;
      onProgress?.(i + 1, total);
      const { data } = await worker.recognize(canvas);
      const confidence = normaliseConfidence(data.confidence ?? 0);
      pages.push({
        pageNumber,
        text: data.text?.trim() ?? "",
        confidence,
      });
    }
  } finally {
    await worker.terminate();
  }

  const lowConfidenceCount = pages.filter(
    (p) => p.confidence < OcrThresholds.minTesseractConfidence,
  ).length;
  const needsPasteFallback = lowConfidenceCount > total / 2;
  const extractedText = pages.map((p) => p.text).filter(Boolean).join("\n\n").trim();

  return { pages, extractedText, needsPasteFallback };
}
