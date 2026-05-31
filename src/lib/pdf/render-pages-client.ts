"use client";

/** Scale factor for OCR — higher improves Tesseract accuracy on scanned handouts. */
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
 * Renders each PDF page to a canvas for client-side Tesseract OCR (Layer 2).
 */
export async function renderPdfPagesToCanvases(
  file: File,
  onProgress?: (current: number, total: number) => void,
): Promise<RenderedPdfPage[]> {
  const pdfjs = await getPdfJs();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const total = pdf.numPages;
  const pages: RenderedPdfPage[] = [];

  for (let pageNum = 1; pageNum <= total; pageNum++) {
    onProgress?.(pageNum, total);
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
