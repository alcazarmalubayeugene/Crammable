"use client";

/** Scale factor for OCR — 2× improves Tesseract accuracy on scanned handouts. */
const OCR_RENDER_SCALE = 2;

export interface RenderedPdfPage {
  pageNumber: number;
  canvas: HTMLCanvasElement;
}

async function getPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  return pdfjs;
}

/**
 * Renders PDF pages to canvases for client-side Tesseract OCR (Layer 2).
 *
 * @param pageNumbers - 1-based page numbers to render. Omit to render all pages.
 *   Pass the imagePageNumbers from the upload response to only render sparse pages,
 *   skipping pages that already have good embedded text.
 */
export async function renderPdfPagesToCanvases(
  file: File,
  onProgress?: (current: number, total: number) => void,
  pageNumbers?: number[],
): Promise<RenderedPdfPage[]> {
  const pdfjs = await getPdfJs();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const totalPdfPages = pdf.numPages;

  const pagesToRender: number[] = pageNumbers
    ? pageNumbers.filter((n) => n >= 1 && n <= totalPdfPages)
    : Array.from({ length: totalPdfPages }, (_, i) => i + 1);

  const total = pagesToRender.length;
  const pages: RenderedPdfPage[] = [];

  for (let i = 0; i < total; i++) {
    const pageNum = pagesToRender[i]!;
    onProgress?.(i + 1, total);
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Could not acquire 2D canvas context for OCR");
    }
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport, canvas }).promise;
    pages.push({ pageNumber: pageNum, canvas });
  }

  return pages;
}
