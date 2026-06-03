"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiErrorCode,
  ApiPaths,
  App,
  MAX_UPLOAD_SIZE_MB,
  OcrThresholds,
  PdfType,
  Routes,
  UIMessages,
  type ApiResponse,
  type GeneratedCard,
  type GenerateRequest,
  type GenerateResult,
  type UploadResult,
} from "@/lib/contracts";
import type { UploadTestDebug } from "@/app/api/upload/route";
import { PDF_EXTRACTION_TEST_MODE } from "@/lib/dev/pdf-test-mode";
import { authHeaders } from "@/lib/api/auth-headers";
import { runOcrOnPages } from "@/lib/pdf/ocr-client";
import { renderPdfPagesToCanvases } from "@/lib/pdf/render-pages-client";

type FlowPhase =
  | "idle"
  | "uploading"
  | "ocr_confirm"
  | "ocr_running"
  | "paste_fallback"
  | "generating"
  | "result"
  | "error";

type ResultView = {
  label: string;
  extractedText?: string;
  cards?: GeneratedCard[];
  creditsRemaining?: number;
  deckId?: string;
  debug?: unknown;
};

export function PdfUploadFlow() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<FlowPhase>("idle");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [ocrMessage, setOcrMessage] = useState("");
  const [pageProgress, setPageProgress] = useState({ current: 0, total: 0 });
  const [pastedText, setPastedText] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [statusLine, setStatusLine] = useState("");
  const [layer1Payload, setLayer1Payload] = useState<unknown>(null);
  const [resultView, setResultView] = useState<ResultView | null>(null);

  const resetToIdle = useCallback(() => {
    setPhase("idle");
    setPdfFile(null);
    setOcrMessage("");
    setPageProgress({ current: 0, total: 0 });
    setPastedText("");
    setErrorMessage("");
    setStatusLine("");
    setLayer1Payload(null);
    setResultView(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const showExtractionPreview = useCallback(
    (label: string, payload: unknown, extractedText?: string) => {
      setResultView({ label, debug: payload, extractedText });
      setPhase("result");
      setStatusLine("");
    },
    [],
  );

  const callGenerate = useCallback(
    async (
      extractedText: string,
      pdfType: (typeof PdfType)[keyof typeof PdfType],
      debug?: unknown,
    ) => {
      setPhase("generating");
      setStatusLine("Sending to DeepSeek and generating flashcards…");
      setErrorMessage("");

      const payload: GenerateRequest = { extractedText, pdfType };
      const headers = await authHeaders({ "Content-Type": "application/json" });
      const res = await fetch(ApiPaths.generate, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as ApiResponse<GenerateResult>;
      if (!data.success) {
        if (data.error.code === ApiErrorCode.EXTRACTION_FAILED) {
          setPhase("paste_fallback");
          setErrorMessage("");
          setResultView({
            label: "Extraction too weak for AI",
            debug: data.error,
            extractedText,
          });
          return;
        }
        setPhase("error");
        setErrorMessage(data.error.message);
        return;
      }

      const isPreview = data.deckId.startsWith("preview-");

      if (isPreview) {
        setResultView({
          label: "DeepSeek flashcards (preview — not saved to database)",
          extractedText: extractedText.slice(0, 2000),
          cards: data.cards,
          creditsRemaining: data.creditsRemaining,
          deckId: data.deckId,
          debug,
        });
        setPhase("result");
        setStatusLine("");
        return;
      }

      setStatusLine(UIMessages.creditDeducted(data.creditsRemaining));
      router.push(Routes.deck(data.deckId));
    },
    [router],
  );

  const uploadPdf = useCallback(
    async (file: File) => {
      setPhase("uploading");
      setErrorMessage("");
      setResultView(null);
      setStatusLine("Uploading and analyzing PDF (Layer 1)…");

      const formData = new FormData();
      formData.append("file", file);

      const headers = await authHeaders();
      const res = await fetch(ApiPaths.upload, {
        method: "POST",
        headers,
        body: formData,
      });

      const data = (await res.json()) as ApiResponse<UploadResult> & {
        _debug?: UploadTestDebug;
      };

      if (!data.success) {
        setPhase("error");
        setErrorMessage(data.error.message);
        return;
      }

      if (data.path === PdfType.TEXT) {
        if (PDF_EXTRACTION_TEST_MODE) {
          showExtractionPreview("Layer 1 — text PDF", data, data.extractedText);
          return;
        }
        await callGenerate(data.extractedText, PdfType.TEXT, data._debug ?? data);
        return;
      }

      setPdfFile(file);
      setOcrMessage(data.message);
      setLayer1Payload(data);
      setPhase("ocr_confirm");
    },
    [callGenerate, showExtractionPreview],
  );

  const onFileSelected = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      await uploadPdf(file);
    },
    [uploadPdf],
  );

  const runClientOcr = useCallback(async () => {
    if (!pdfFile) return;

    setPhase("ocr_running");
    setErrorMessage("");
    setResultView(null);

    try {
      const rendered = await renderPdfPagesToCanvases(pdfFile, (current, total) => {
        setPageProgress({ current, total });
        setStatusLine(UIMessages.ocrProgress(current, total));
      });

      const ocrResult = await runOcrOnPages(rendered, (current, total) => {
        setPageProgress({ current, total });
        setStatusLine(UIMessages.ocrProgress(current, total));
      });

      const debug = {
        path: PdfType.OCR,
        needsPasteFallback: ocrResult.needsPasteFallback,
        minTesseractConfidence: OcrThresholds.minTesseractConfidence,
        pages: ocrResult.pages.map((p) => ({
          page: p.pageNumber,
          confidence: Math.round(p.confidence * 1000) / 1000,
          charCount: p.text.replace(/\s/g, "").length,
        })),
      };

      if (ocrResult.needsPasteFallback || !ocrResult.extractedText.trim()) {
        setPhase("paste_fallback");
        setResultView({
          label: "Layer 2 — low OCR confidence → paste fallback",
          debug,
        });
        return;
      }

      if (PDF_EXTRACTION_TEST_MODE) {
        showExtractionPreview("Layer 2 — OCR success", debug, ocrResult.extractedText);
        return;
      }

      await callGenerate(ocrResult.extractedText, PdfType.OCR, debug);
    } catch (err) {
      setPhase("paste_fallback");
      setErrorMessage(err instanceof Error ? err.message : "OCR failed");
    }
  }, [pdfFile, callGenerate, showExtractionPreview]);

  const submitPaste = useCallback(async () => {
    const text = pastedText.trim();
    if (!text) {
      setErrorMessage("Please paste your notes before continuing.");
      return;
    }
    setErrorMessage("");

    if (PDF_EXTRACTION_TEST_MODE) {
      showExtractionPreview("Layer 3 — manual paste", { path: PdfType.PASTE }, text);
      return;
    }

    await callGenerate(text, PdfType.PASTE);
  }, [pastedText, callGenerate, showExtractionPreview]);

  const isBusy =
    phase === "uploading" || phase === "ocr_running" || phase === "generating";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Upload PDF
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {PDF_EXTRACTION_TEST_MODE ? (
            <>
              <span className="font-medium text-amber-700 dark:text-amber-400">
                Extraction test mode
              </span>
              {" — "}
              DeepSeek generate is off. Set PDF_EXTRACTION_TEST_MODE to false in{" "}
              <code className="text-xs">src/lib/dev/pdf-test-mode.ts</code>.
            </>
          ) : (
            <>
              Upload a handout (max {MAX_UPLOAD_SIZE_MB} MB). {App.name} extracts text, then
              sends it to DeepSeek to build flashcards. One credit is used only after cards
              are generated successfully.
            </>
          )}
        </p>
      </header>

      {phase === "idle" && (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-6 py-12 transition hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/50 dark:hover:border-zinc-500">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Choose a PDF file
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={onFileSelected}
          />
        </label>
      )}

      {(phase === "uploading" || phase === "generating") && (
        <div
          className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
          role="status"
        >
          {statusLine || "Working…"}
        </div>
      )}

      {phase === "ocr_confirm" && pdfFile && (
        <div className="flex flex-col gap-4 rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/50 dark:bg-amber-950/30">
          <p className="text-sm text-amber-950 dark:text-amber-100">{ocrMessage}</p>
          {layer1Payload != null ? (
            <details className="rounded-lg border border-amber-300/60 bg-white/60 dark:border-amber-800 dark:bg-black/20">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-amber-900 dark:text-amber-200">
                Layer 1 server response (JSON)
              </summary>
              <pre className="max-h-48 overflow-auto px-3 pb-3 text-xs text-zinc-800 dark:text-zinc-200">
                {JSON.stringify(layer1Payload, null, 2)}
              </pre>
            </details>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={runClientOcr}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Continue (Layer 2 OCR)
            </button>
            <button
              type="button"
              onClick={() => {
                setPhase("paste_fallback");
                setStatusLine("");
              }}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300"
            >
              Paste text instead
            </button>
            <button
              type="button"
              onClick={resetToIdle}
              className="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400"
            >
              Start over
            </button>
          </div>
        </div>
      )}

      {phase === "ocr_running" && (
        <div
          className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            {pageProgress.total > 0
              ? UIMessages.ocrProgress(pageProgress.current, pageProgress.total)
              : "Preparing OCR…"}
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            <div
              className="h-full bg-zinc-900 transition-all duration-300 dark:bg-zinc-100"
              style={{
                width:
                  pageProgress.total > 0
                    ? `${(pageProgress.current / pageProgress.total) * 100}%`
                    : "0%",
              }}
            />
          </div>
        </div>
      )}

      {phase === "paste_fallback" && (
        <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            {UIMessages.ocrFallbackPrompt}
          </p>
          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            rows={12}
            className="w-full resize-y rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            placeholder="Paste your lecture notes or handout text here…"
          />
          {errorMessage && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {errorMessage}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={isBusy}
              onClick={submitPaste}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {PDF_EXTRACTION_TEST_MODE ? "Show paste output" : "Generate flashcards"}
            </button>
            <button
              type="button"
              onClick={resetToIdle}
              className="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400"
            >
              Start over
            </button>
          </div>
        </div>
      )}

      {phase === "result" && resultView && (
        <div className="flex flex-col gap-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
              {resultView.label}
            </h3>
            <button
              type="button"
              onClick={resetToIdle}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-white dark:border-zinc-600 dark:text-zinc-300"
            >
              Upload another PDF
            </button>
          </div>

          {resultView.cards && resultView.cards.length > 0 && (
            <div className="flex flex-col gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Generated flashcards ({resultView.cards.length})
              </p>
              <ul className="flex max-h-96 flex-col gap-2 overflow-auto">
                {resultView.cards.map((card, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">
                      {card.front}
                    </p>
                    <p className="mt-1 text-zinc-600 dark:text-zinc-400">{card.back}</p>
                    {card.tags.length > 0 && (
                      <p className="mt-2 text-xs text-zinc-500">
                        {card.tags.join(" · ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {resultView.extractedText !== undefined && (
            <details>
              <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-zinc-500">
                Extracted text preview
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-zinc-200 bg-white p-3 text-xs whitespace-pre-wrap text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                {resultView.extractedText || "(empty)"}
              </pre>
            </details>
          )}

          {resultView.debug != null && (
            <details>
              <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-zinc-500">
                Pipeline debug JSON
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-zinc-200 bg-white p-3 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                {JSON.stringify(resultView.debug, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}

      {phase === "error" && (
        <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-5 dark:border-red-900/50 dark:bg-red-950/30">
          <p className="text-sm text-red-800 dark:text-red-200" role="alert">
            {errorMessage}
          </p>
          <button
            type="button"
            onClick={resetToIdle}
            className="self-start rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Try again
          </button>
        </div>
      )}

      {!PDF_EXTRACTION_TEST_MODE && phase === "generating" && (
        <p className="text-xs text-zinc-500">{UIMessages.aiDisclaimer}</p>
      )}
    </div>
  );
}
