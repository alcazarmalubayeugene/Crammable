"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiErrorCode,
  ApiPaths,
  App,
  CardCountOptions,
  GenerationMode,
  MAX_FILES_PER_UPLOAD,
  MAX_UPLOAD_SIZE_MB,
  OcrThresholds,
  PdfType,
  Routes,
  SubscriptionTier,
  TableNames,
  TierLimits,
  UIMessages,
  Validation,
  type ApiResponse,
  type GeneratedCard,
  type GenerateRequest,
  type GenerateResult,
  type MultiUploadResult,
  type PerFileUploadResult,
} from "@/lib/contracts";
import { budgetCombinedText, type BudgetedFileText } from "@/lib/text/truncate";
import type { UploadTestDebug } from "@/app/api/upload/route";
import { PDF_EXTRACTION_TEST_MODE } from "@/lib/dev/pdf-test-mode";
import { authHeaders } from "@/lib/api/auth-headers";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useAppProfile } from "@/app/(app)/AppProfileContext";
import { runOcrOnPages } from "@/lib/pdf/ocr-client";
import { renderPdfPagesToCanvases } from "@/lib/pdf/render-pages-client";

type FlowPhase =
  | "idle"
  | "uploading"
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
  // Keep the shared nav coin balance in sync after a generation deducts a credit.
  const { mutate: mutateProfile } = useAppProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<FlowPhase>("idle");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pageProgress, setPageProgress] = useState({ current: 0, total: 0 });
  const [pastedText, setPastedText]           = useState("");
  const [errorMessage, setErrorMessage]       = useState("");
  // S4: per-file upload progress (one request per file) — "Reading 2 of 3 — notes.pdf"
  const [fileProgress, setFileProgress]       = useState<{ current: number; total: number; filename: string } | null>(null);
  // S4: files that failed individually — the rest of the batch still proceeds.
  const [batchFailures, setBatchFailures]     = useState<{ filename: string; message: string }[]>([]);
  // S5: set when the proportional text budget had to cut content — warn BEFORE
  // a Capycoin is charged, so a partial deck is never silently generated.
  const [budgetWarning, setBudgetWarning]     = useState<string | null>(null);
  // S6: per-file status for the recovery list — keyed by selectedFiles index.
  const [fileStatuses, setFileStatuses]       = useState<Record<number, "queued" | "reading" | "done" | "skipped">>({});
  const [layer1Payload, setLayer1Payload]     = useState<unknown>(null);
  const [resultView, setResultView]           = useState<ResultView | null>(null);
  // Populated when the upload returns path: "ocr" — used for selective page rendering.
  const [imagePageNumbers, setImagePageNumbers] = useState<number[]>([]);
  const [partialText, setPartialText]           = useState("");

  // ── AI consent gate ───────────────────────────────────────────────────────────
  const [consentChecked, setConsentChecked] = useState(false);   // loading done
  const [hasConsented, setHasConsented] = useState(false);
  const [consentTicked, setConsentTicked] = useState(false);     // checkbox in consent card
  const [consentSaving, setConsentSaving] = useState(false);
  const [consentError, setConsentError] = useState("");

  // ── Generation mode (B2: Deep Dive, Pro-only) ───────────────────────────────────
  const [subscriptionTier, setSubscriptionTier] = useState<(typeof SubscriptionTier)[keyof typeof SubscriptionTier]>(SubscriptionTier.FREE);
  const [generationMode, setGenerationMode] = useState<GenerationMode>(GenerationMode.STANDARD);
  const isPro = subscriptionTier === SubscriptionTier.PRO;
  // Current balance, read alongside consent/tier below — lets the generating
  // screen show a real anticipated remaining count instead of a static line.
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);

  // ── Deck settings (name + card count) ───────────────────────────────────────
  const [deckName, setDeckName] = useState("");
  const [cardCount, setCardCount] = useState<(typeof CardCountOptions)[number]>(10);
  const tierMaxCards = TierLimits[subscriptionTier].maxCardsPerDeck;

  // Files are attached on selection but generation only starts when the user
  // explicitly clicks "Generate flashcards" — lets deck settings be filled in first.
  // Multi-PDF: choosing files replaces the whole selection (native <input> behavior);
  // individual files can be removed from the staged list afterward.
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileSelectWarning, setFileSelectWarning] = useState("");

  // Concept #4's "Generating" checklist (Finding key concepts… / Writing your
  // flashcards) splits the single opaque /api/generate call into two
  // perceived-progress stages — there's no real sub-progress signal from the
  // backend (one DeepSeek round trip, no streaming), so this is a timer-based
  // approximation purely for "no blank spinner" feel, not a measured metric.
  const [genStage, setGenStage] = useState<1 | 2>(1);
  useEffect(() => {
    if (phase !== "generating") return;
    const t = setTimeout(() => setGenStage(2), 2500);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    async function checkConsent() {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setConsentChecked(true); return; }
      const { data } = await supabase
        .from(TableNames.profiles)
        .select("consent_deepseek, subscription_tier, token_balance")
        .eq("id", user.id)
        .single();
      setHasConsented(data?.consent_deepseek === true);
      if (data?.subscription_tier) {
        setSubscriptionTier(data.subscription_tier as (typeof SubscriptionTier)[keyof typeof SubscriptionTier]);
      }
      if (typeof data?.token_balance === "number") {
        setTokenBalance(data.token_balance);
      }
      setConsentChecked(true);
    }
    checkConsent();
  }, []);

  const handleGiveConsent = useCallback(async () => {
    if (!consentTicked) { setConsentError("Please tick the checkbox to continue."); return; }
    setConsentSaving(true);
    setConsentError("");
    const supabase = getSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setConsentError("Session expired. Please log in again."); setConsentSaving(false); return; }
    const { error } = await supabase
      .from(TableNames.profiles)
      .update({ consent_deepseek: true })
      .eq("id", user.id);
    if (error) { setConsentError("Failed to save. Please try again."); setConsentSaving(false); return; }
    setHasConsented(true);
    setConsentSaving(false);
  }, [consentTicked]);

  const resetToIdle = useCallback(() => {
    setPhase("idle");
    setSelectedFiles([]);
    setFileSelectWarning("");
    setPdfFile(null);
    setPageProgress({ current: 0, total: 0 });
    setPastedText("");
    setErrorMessage("");
    setFileProgress(null);
    setBatchFailures([]);
    setBudgetWarning(null);
    setFileStatuses({});
    setLayer1Payload(null);
    setResultView(null);
    setImagePageNumbers([]);
    setPartialText("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const showExtractionPreview = useCallback(
    (label: string, payload: unknown, extractedText?: string) => {
      setResultView({ label, debug: payload, extractedText });
      setPhase("result");
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
      setGenStage(1);
      setErrorMessage("");

      const GENERATE_TIMEOUT_MS = 120_000; // 2 min -- server maxDuration is 60 s
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);

      let data: ApiResponse<GenerateResult>;
      try {
        const payload: GenerateRequest = {
          extractedText,
          pdfType,
          title: deckName.trim() || undefined,
          maxCards: cardCount,
          ...(generationMode === GenerationMode.DEEP_DIVE ? { generationMode } : {}),
        };
        const headers = await authHeaders({ "Content-Type": "application/json" });
        const res = await fetch(ApiPaths.generate, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          const detail = text.slice(0, 200) || "HTTP ".concat(String(res.status));
          throw new Error("Server error (".concat(String(res.status), "): ", detail));
        }

        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          const text = await res.text().catch(() => "");
          throw new Error("Unexpected response (".concat(String(res.status), "): ", text.slice(0, 200)));
        }

        data = (await res.json()) as ApiResponse<GenerateResult>;
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
      } catch (err) {
        if (controller.signal.aborted) {
          setPhase("error");
          setErrorMessage("That took too long -- try fewer files or a smaller PDF.");
        } else {
          const message = err instanceof Error ? err.message : "Something went wrong.";
          setPhase("error");
          setErrorMessage("Generation failed: ".concat(message));
        }
        return;
      } finally {
        clearTimeout(timeoutId);
      }

      // A successful generation deducts a credit — push the fresh balance into
      // the shared profile so the nav coin pill is correct on the next page.
      if (typeof data.creditsRemaining === "number") {
        mutateProfile({ token_balance: data.creditsRemaining });
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
        return;
      }

      router.push(Routes.deck(data.deckId));
    },
    [router, generationMode, deckName, cardCount, mutateProfile],
  );

  // S3b: core per-file OCR — render the sparse pages, run Tesseract, merge the
  // result with the server's partial text. Shared by the single-file path and
  // the multi-file sequential OCR queue. Returns the merged text (may be "")
  // plus debug info; throws only on hard failures (render/Tesseract errors).
  const ocrFileToText = useCallback(
    async (
      file: File,
      imagePageNumbers: number[],
      partialText: string,
    ): Promise<{ finalText: string; debug: unknown; needsPasteFallback: boolean }> => {
      // Only render pages the server flagged as sparse — skips pages that already
      // have good embedded text, saving significant time on mixed PDFs.
      const pagesToOcr = imagePageNumbers.length > 0 ? imagePageNumbers : undefined;

      const rendered = await renderPdfPagesToCanvases(
        file,
        (current, total) => {
          setPageProgress({ current, total });
        },
        pagesToOcr,
      );

      const ocrResult = await runOcrOnPages(rendered, (current, total) => {
        setPageProgress({ current, total });
      });

      const debug = {
        path: PdfType.OCR,
        scannedPageNumbers: pagesToOcr ?? "all",
        needsPasteFallback: ocrResult.needsPasteFallback,
        minTesseractConfidence: OcrThresholds.minTesseractConfidence,
        hasPartialText: Boolean(partialText),
        pages: ocrResult.pages.map((p) => ({
          page: p.pageNumber,
          confidence: Math.round(p.confidence * 1000) / 1000,
          charCount: p.text.replace(/\s/g, "").length,
        })),
      };

      // Merge server-extracted text (good pages) with OCR text (image pages).
      // If OCR confidence was too low, fall back to the partial text alone rather
      // than all the way to paste — partial text is better than nothing.
      const ocrSucceeded = !ocrResult.needsPasteFallback && ocrResult.extractedText.trim();
      const finalText = [
        partialText,
        ocrSucceeded ? ocrResult.extractedText : "",
      ]
        .filter(Boolean)
        .join("\n\n")
        .trim();

      return { finalText, debug, needsPasteFallback: ocrResult.needsPasteFallback };
    },
    [],
  );

  // Single-file OCR flow: auto-proceed from the upload response, then generate
  // directly. Paste fallback is the single-file dead-end (per-file paste
  // fallback for multi-file batches is handled by the queue in uploadPdfs).
  const runClientOcr = useCallback(async (
    overrideFile?: File,
    overrideImagePages?: number[],
    overridePartialText?: string,
  ) => {
    const file = overrideFile ?? pdfFile;
    if (!file) return;

    setPhase("ocr_running");
    setErrorMessage("");
    setResultView(null);

    const resolvedImagePages = overrideImagePages ?? imagePageNumbers;
    const resolvedPartialText = overridePartialText ?? partialText;

    try {
      const { finalText, debug } = await ocrFileToText(file, resolvedImagePages, resolvedPartialText);

      if (!finalText) {
        setPhase("paste_fallback");
        setResultView({
          label: "Layer 2 — low OCR confidence, no partial text → paste fallback",
          debug,
        });
        return;
      }

      if (PDF_EXTRACTION_TEST_MODE) {
        showExtractionPreview("Layer 2 — OCR success", debug, finalText);
        return;
      }

      await callGenerate(finalText, PdfType.OCR, debug);
    } catch (err) {
      setPhase("paste_fallback");
      setErrorMessage(err instanceof Error ? err.message : "OCR failed");
    }
  }, [pdfFile, imagePageNumbers, partialText, ocrFileToText, callGenerate, showExtractionPreview]);

  const uploadPdfs = useCallback(
    async (files: File[]) => {
      setPhase("uploading");
      setErrorMessage("");
      setResultView(null);
      setFileProgress(null);
      setBatchFailures([]);
      setBudgetWarning(null);

      // S4 pre-flight: total batch size checked client-side BEFORE any network
      // I/O, mirroring the server's worst-case acceptance — a doomed batch
      // should never burn rate-limit slots on requests that cannot succeed.
      const totalBytes = files.reduce(function (sum, f) { return sum + f.size; }, 0);
      const totalCapBytes = MAX_UPLOAD_SIZE_MB * MAX_FILES_PER_UPLOAD * 1024 * 1024;
      if (totalBytes > totalCapBytes) {
        setPhase("error");
        setErrorMessage(
          "Those files total ".concat(
            (totalBytes / (1024 * 1024)).toFixed(1),
            " MB. Capy can read up to ",
            String(MAX_UPLOAD_SIZE_MB * MAX_FILES_PER_UPLOAD),
            " MB per deck -- remove a file and try again.",
          ),
        );
        return;
      }

      // S4: one request per file, in order. Each request sits far under the
      // platform body cap and gets its own 60 s server budget, so one large or
      // slow file can no longer sink the whole batch. Failures are recorded
      // per-file and the rest of the batch still proceeds.
      const successes: Array<{ file: File; result: PerFileUploadResult }> = [];
      const failures: Array<{ filename: string; message: string }> = [];
      const debugByFile: UploadTestDebug[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let fileOk = false;
        // S6: mark this file as being read in the status list.
        setFileStatuses(function (prev) {
          const next = Object.assign({}, prev);
          next[i] = "reading";
          return next;
        });
        setFileProgress({ current: i + 1, total: files.length, filename: file.name });

        const controller = new AbortController();
        const timeoutId = setTimeout(function () { controller.abort(); }, 120_000);

        try {
          const formData = new FormData();
          formData.append("file", file);

          const headers = await authHeaders();
          const res = await fetch(ApiPaths.upload, {
            method: "POST",
            headers,
            body: formData,
            signal: controller.signal,
          });

          if (!res.ok) {
            const statusText = "HTTP ".concat(String(res.status));
            let detail = "";
            try { detail = await res.text(); } catch { /* ignore */ }
            if (res.status === 413) {
              failures.push({ filename: file.name, message: "Too large to upload -- try a smaller file." });
            } else if (res.status === 504) {
              failures.push({ filename: file.name, message: "Timed out -- try a smaller file." });
            } else {
              failures.push({ filename: file.name, message: statusText.concat(": ", (detail || statusText).slice(0, 200)) });
            }
            continue;
          }

          const contentType = res.headers.get("content-type") ?? "";
          if (contentType.indexOf("application/json") === -1) {
            let badText = "";
            try { badText = await res.text(); } catch { /* ignore */ }
            failures.push({ filename: file.name, message: "Unexpected response (".concat(String(res.status), "): ", badText.slice(0, 200)) });
            continue;
          }

          const data = (await res.json()) as ApiResponse<MultiUploadResult> & {
            _debug?: UploadTestDebug[];
          };

          if (!data.success) {
            failures.push({ filename: file.name, message: data.error.message });
            continue;
          }

          const [only] = data.files;
          if (!only) {
            failures.push({ filename: file.name, message: "Server returned no result for this file." });
            continue;
          }
          successes.push({ file, result: only });
          fileOk = true;
          if (data._debug?.[0]) debugByFile.push(data._debug[0]);
        } catch (err) {
          const message = controller.signal.aborted
            ? "Reading took too long -- try a smaller file."
            : err instanceof Error ? err.message : "Something went wrong.";
          failures.push({ filename: file.name, message: message });
        } finally {
          // S6: resolve this file's status — "done" or "skipped".
          setFileStatuses(function (prev) {
            const next = Object.assign({}, prev);
            next[i] = fileOk ? "done" : "skipped";
            return next;
          });
          clearTimeout(timeoutId);
        }
      }

      if (successes.length === 0) {
        setPhase("error");
        setErrorMessage(
          "None of your files could be read. ".concat(
            failures.map(function (f) { return '"'.concat(f.filename, '": ', f.message); }).join(" "),
          ),
        );
        return;
      }

      if (failures.length > 0) {
        setBatchFailures(failures);
      }

      // Single file: full behavior unchanged, including the OCR/paste-fallback
      // pipeline below (which is inherently single-file -- it renders and
      // Tesseract-scans pages of ONE PDF).
      if (successes.length === 1) {
        const { file, result: only } = successes[0];
        const debug = debugByFile[0] ?? only;

        if (only.path === PdfType.TEXT) {
          // S5: a single oversized file is also silently tail-truncated server-
          // side; budget it here so the user is warned BEFORE a credit is used.
          const budget = budgetCombinedText([{ filename: only.filename, text: only.extractedText }]);
          if (budget.droppedChars > 0) {
            setBudgetWarning(
              "This PDF is larger than one deck can hold -- only the first ~".concat(
                String(Math.round(budget.combinedText.length / 100) * 100),
                " characters fit. The rest was trimmed.",
              ),
            );
          }
          if (PDF_EXTRACTION_TEST_MODE) {
            showExtractionPreview("Layer 1 -- text PDF", debug, budget.combinedText);
            return;
          }
          await callGenerate(budget.combinedText, PdfType.TEXT, debug);
          return;
        }

        setImagePageNumbers(only.imagePageNumbers);
        setPartialText(only.partialText);
        setPdfFile(file);
        setLayer1Payload(only);
        // Auto-proceed to OCR -- pass values directly to avoid stale-closure race
        await runClientOcr(file, only.imagePageNumbers, only.partialText);
        return;
      }

      // Multiple files (S3b): TEXT files combine directly; OCR-classified files
      // are processed sequentially through client-side OCR and merged in order.
      // A file whose OCR yields no usable text is skipped and reported — it no
      // longer kills the whole batch (finding A removed).
      const results = successes.map(function (s) { return s.result; });
      const deckFiles: BudgetedFileText[] = [];
      const ocrQueue: Array<{ file: File; result: PerFileUploadResult }> = [];
      for (const s of successes) {
        if (s.result.path === PdfType.TEXT) {
          deckFiles.push({ filename: s.result.filename, text: s.result.extractedText });
        } else {
          ocrQueue.push(s);
        }
      }

      for (let i = 0; i < ocrQueue.length; i++) {
        const { file, result } = ocrQueue[i];
        // Narrow the union: only OCR-variant results reach this queue (TEXT
        // results were filtered above), so imagePageNumbers/partialText are
        // required here, not the optional TEXT-variant shape.
        if (result.path !== PdfType.OCR) continue;
        setPhase("ocr_running");
        setFileProgress({ current: i + 1, total: ocrQueue.length, filename: file.name });
        try {
          const { finalText } = await ocrFileToText(file, result.imagePageNumbers, result.partialText);
          if (finalText) {
            deckFiles.push({ filename: result.filename, text: finalText });
          } else {
            failures.push({
              filename: file.name,
              message: "OCR couldn't read this file -- it was skipped. Try uploading it alone and pasting its text.",
            });
          }
        } catch (err) {
          failures.push({
            filename: file.name,
            message: err instanceof Error ? err.message : "OCR failed -- file skipped.",
          });
        }
      }

      // S5: give every file a proportional share of the token budget instead of
      // letting the first files consume it and silently dropping the tail.
      const budget = budgetCombinedText(deckFiles);
      if (budget.droppedChars > 0) {
        setBudgetWarning(
          "Your files total more than one deck can hold -- content from ".concat(
            budget.droppedFrom.join(", "),
            " was trimmed so every file still contributes.",
          ),
        );
      }

      if (failures.length > 0) {
        setBatchFailures(failures);
      }

      if (!budget.combinedText) {
        setPhase("error");
        setErrorMessage(
          "None of your files produced readable text. ".concat(
            failures.map(function (f) { return '"'.concat(f.filename, '": ', f.message); }).join(" "),
          ),
        );
        return;
      }

      if (PDF_EXTRACTION_TEST_MODE) {
        showExtractionPreview("Layer 1+2 -- ".concat(String(successes.length), " files combined (", String(ocrQueue.length), " OCR'd)"), { files: results, _debug: debugByFile }, budget.combinedText);
        return;
      }
      await callGenerate(budget.combinedText, PdfType.TEXT, debugByFile.length > 0 ? debugByFile : results);
    },
    [callGenerate, showExtractionPreview, ocrFileToText, runClientOcr],
  );

  const onFileSelected = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const chosen = Array.from(event.target.files ?? []);
      if (chosen.length === 0) return;
      setFileStatuses({});
      setBudgetWarning(null);
      if (chosen.length > MAX_FILES_PER_UPLOAD) {
        setFileSelectWarning(`You can combine up to ${MAX_FILES_PER_UPLOAD} PDFs into one deck — only the first ${MAX_FILES_PER_UPLOAD} were kept.`);
        setSelectedFiles(chosen.slice(0, MAX_FILES_PER_UPLOAD));
        return;
      }
      setFileSelectWarning("");
      setSelectedFiles(chosen);
    },
    [],
  );

  const removeSelectedFile = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setFileStatuses((prev) => {
      const next: Record<number, "queued" | "reading" | "done" | "skipped"> = {};
      for (const [k, v] of Object.entries(prev)) {
        const key = Number(k);
        if (key === index) continue;          // dropped file
        next[key > index ? key - 1 : key] = v; // shift later indices down
      }
      return next;
    });
    setBudgetWarning(null);
    setFileSelectWarning("");
  }, []);

  const handleGenerateClick = useCallback(async () => {
    if (selectedFiles.length === 0) return;
    await uploadPdfs(selectedFiles);
  }, [selectedFiles, uploadPdfs]);

  const handleCancel = useCallback(() => {
    router.push(Routes.dashboard);
  }, [router]);

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

  // ── consent gate — show before anything else ─────────────────────────────────
  if (!consentChecked) {
    return (
      <div style={{ margin: "0 auto", display: "flex", width: "100%", maxWidth: 768, flexDirection: "column", gap: 24 }}>
        <div
          className="anim-fade-up"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            border: "1.5px solid var(--border)",
            background: "var(--bg-card)",
            borderRadius: 16,
            padding: "20px 24px",
            fontFamily: "var(--font-body, sans-serif)",
          }}
        >
          <span className="spinner" />
          <span style={{ fontSize: "calc(15px * var(--font-scale))", color: "var(--text-muted)" }}>
            Checking account
            <span aria-hidden="true">
              <span className="ellipsis-dot">.</span>
              <span className="ellipsis-dot">.</span>
              <span className="ellipsis-dot">.</span>
            </span>
          </span>
        </div>
      </div>
    );
  }

  if (!hasConsented) {
    return (
      <div style={{ margin: "0 auto", display: "flex", width: "100%", maxWidth: 768, flexDirection: "column", gap: 24 }}>
        <header>
          <h2 style={{ fontSize: "calc(18px * var(--font-scale))", fontWeight: 600, color: "var(--text)", margin: 0 }}>Upload PDF</h2>
          <p style={{ marginTop: 4, fontSize: "calc(14px * var(--font-scale))", color: "var(--text-muted)" }}>One quick step before you continue.</p>
        </header>
        <div style={{ background: "var(--bg-subtle)", border: "1.5px solid var(--border)", borderRadius: 12, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ fontSize: "calc(15px * var(--font-scale))", fontWeight: 700, color: "var(--text)", margin: 0 }}>AI processing consent required</p>
          <p style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--nav-border)", lineHeight: 1.6, margin: 0 }}>
            {App.name} sends your uploaded documents to DeepSeek AI to generate flashcards.
            Your documents are processed to extract text and create study cards — they are not stored by DeepSeek beyond the request.
            Do not upload documents containing sensitive or confidential information.
          </p>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={consentTicked}
              onChange={(e) => { setConsentTicked(e.target.checked); setConsentError(""); }}
              style={{ marginTop: 2, width: 16, height: 16, accentColor: "var(--primary)", flexShrink: 0 }}
            />
            <span style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text)", lineHeight: 1.6 }}>
              <strong>I understand and agree</strong> that my uploaded documents will be processed by DeepSeek AI to generate flashcards. I will not upload sensitive or confidential information.
            </span>
          </label>
          {consentError && <p style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--error)", margin: 0 }}>{consentError}</p>}
          <button
            type="button"
            onClick={handleGiveConsent}
            disabled={consentSaving}
            className="btn-solid"
            style={{
              alignSelf: "flex-start",
              background: consentSaving ? "var(--text-faint)" : "var(--primary)",
              color: "var(--nav-text)",
              border: "none",
              borderRadius: 8,
              padding: "10px 24px",
              fontSize: "calc(14px * var(--font-scale))",
              fontWeight: 600,
              cursor: consentSaving ? "not-allowed" : "pointer",
              fontFamily: "var(--font-body, sans-serif)",
            }}
          >
            {consentSaving ? "Saving…" : "Continue to upload"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="anim-fade-up" style={{ margin: "0 auto", display: "flex", width: "100%", maxWidth: 768, flexDirection: "column", gap: 14 }}>
      {PDF_EXTRACTION_TEST_MODE && (
        <header>
          <p style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--text-muted)" }}>
            <span style={{ fontWeight: 600, color: "var(--primary)" }}>
              Extraction test mode
            </span>
            {" — "}
            DeepSeek generate is off. Set PDF_EXTRACTION_TEST_MODE to false in{" "}
            <code style={{ fontSize: "calc(12px * var(--font-scale))" }}>src/lib/dev/pdf-test-mode.ts</code>.
          </p>
        </header>
      )}

      {phase === "idle" && (
        <>
          <div
            style={{ display: "flex", flexDirection: "column", gap: 6, background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: 20, padding: 18 }}
          >
            <p style={{ fontSize: "calc(12.5px * var(--font-scale))", color: "var(--text-muted)", margin: "0 0 4px" }}>
              <em style={{ color: "var(--primary)", fontStyle: "italic" }}>Capy</em> extracts the
              text and sends it to DeepSeek — one Capycoin is used only after cards are
              generated successfully.
            </p>
          <label
            style={{
              display: "flex",
              cursor: "pointer",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              borderRadius: 16,
              border: "2px dashed var(--border)",
              background: "var(--bg-subtle)",
              padding: "22px 24px",
              marginTop: 4,
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: "calc(26px * var(--font-scale))", lineHeight: 1 }}>📄</span>
            {selectedFiles.length > 0 ? (
              <>
                <span style={{ fontSize: "calc(14px * var(--font-scale))", fontWeight: 600, color: "var(--text)" }}>
                  {selectedFiles.length === 1 ? selectedFiles[0].name : `${selectedFiles.length} files selected`}
                </span>
                <span style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)" }}>
                  click to change selection
                </span>
              </>
            ) : (
              <>
                <span style={{ fontSize: "calc(14px * var(--font-scale))", fontWeight: 600, color: "var(--text)" }}>
                  Drop your PDF(s) here
                </span>
                <span style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)" }}>
                  or click to browse — max {MAX_UPLOAD_SIZE_MB} MB each, up to {MAX_FILES_PER_UPLOAD} files per deck
                </span>
              </>
            )}
            <span
              className="btn-solid"
              style={{
                marginTop: 4,
                background: "var(--primary)",
                color: "var(--on-primary)",
                borderRadius: 999,
                padding: "8px 22px",
                fontSize: "calc(13px * var(--font-scale))",
                fontWeight: 600,
                fontFamily: "var(--font-body, sans-serif)",
              }}
            >
              Choose file(s)
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              onChange={onFileSelected}
              style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", border: 0 }}
            />
          </label>

          {fileSelectWarning && (
            <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--error)", margin: "8px 0 0" }}>
              {fileSelectWarning}
            </p>
          )}

          {selectedFiles.length > 1 && (
            <ul style={{ display: "flex", flexDirection: "column", gap: 6, margin: "10px 0 0", padding: 0, listStyle: "none" }}>
              {selectedFiles.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 10px", borderRadius: 8, background: "var(--bg-subtle)", fontSize: "calc(12.5px * var(--font-scale))", color: "var(--text)" }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.name} <span style={{ color: "var(--text-faint)" }}>({(f.size / (1024 * 1024)).toFixed(1)} MB)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeSelectedFile(i)}
                    aria-label={`Remove ${f.name}`}
                    style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: "calc(14px * var(--font-scale))", lineHeight: 1, padding: "2px 6px", flexShrink: 0 }}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          </div>

          <div
            style={{ display: "flex", flexDirection: "column", gap: 8, border: "1.5px solid var(--border)", background: "var(--bg-card)", borderRadius: 20, padding: 18 }}
          >
            <p
              style={{ fontSize: "calc(12px * var(--font-scale))", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-faint)", margin: 0 }}
            >
              Generation mode
            </p>

            <button
              type="button"
              onClick={() => setGenerationMode(GenerationMode.STANDARD)}
              className={`chip-card${generationMode === GenerationMode.STANDARD ? " chip-card-active" : ""}`}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "flex-start",
                gap: 14,
                textAlign: "left",
                width: "100%",
                boxSizing: "border-box",
                background: generationMode === GenerationMode.STANDARD ? "var(--nav-bg)" : "var(--bg-card)",
                border: generationMode === GenerationMode.STANDARD ? "1.5px solid var(--primary)" : "1.5px solid var(--border)",
                borderRadius: 14,
                padding: "10px 16px",
                cursor: "pointer",
                fontFamily: "var(--font-body, sans-serif)",
              }}
            >
              <span style={{ fontSize: "calc(20px * var(--font-scale))", lineHeight: 1.3, flexShrink: 0 }}>📄</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    fontWeight: 600,
                    fontSize: "calc(14px * var(--font-scale))",
                    color: generationMode === GenerationMode.STANDARD ? "var(--nav-text)" : "var(--text)",
                  }}
                >
                  Standard
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: "calc(13px * var(--font-scale))",
                    color: generationMode === GenerationMode.STANDARD ? "var(--text-faint)" : "var(--text-muted)",
                  }}
                >
                  Concise, exam-ready flashcards.
                </span>
              </span>
              {generationMode === GenerationMode.STANDARD && (
                <span style={{ fontSize: "calc(16px * var(--font-scale))", color: "var(--primary)", alignSelf: "center", flexShrink: 0 }}>✓</span>
              )}
            </button>

            {(() => {
              const isActive = generationMode === GenerationMode.DEEP_DIVE && isPro;
              const cardStyle = {
                display: "flex",
                flexWrap: "wrap" as const,
                alignItems: "flex-start",
                gap: 14,
                textAlign: "left" as const,
                width: "100%",
                boxSizing: "border-box" as const,
                background: isActive ? "var(--nav-bg)" : "var(--bg-card)",
                border: isActive ? "1.5px solid var(--primary)" : "1.5px solid var(--border)",
                borderRadius: 14,
                padding: "10px 16px",
                cursor: "pointer",
                textDecoration: "none",
                fontFamily: "var(--font-body, sans-serif)",
              };
              const titleColor = isActive ? "var(--nav-text)" : "var(--text)";
              const descColor = isActive ? "var(--text-faint)" : "var(--text-muted)";

              const content = (
                <>
                  <span style={{ fontSize: "calc(20px * var(--font-scale))", lineHeight: 1.3, flexShrink: 0 }}>🔬</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontWeight: 600, fontSize: "calc(14px * var(--font-scale))", color: titleColor }}>
                      Deep Dive (Pro)
                      {!isPro && (
                        <span
                          style={{
                            fontSize: "calc(10px * var(--font-scale))",
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                            color: "var(--on-primary)",
                            background: "var(--primary)",
                            borderRadius: 5,
                            padding: "2px 7px",
                            flexShrink: 0,
                          }}
                        >
                          PRO
                        </span>
                      )}
                    </span>
                    <span style={{ display: "block", fontSize: "calc(13px * var(--font-scale))", color: descColor, marginTop: 2 }}>
                      Thorough explanations, examples, and common pitfalls for each card.
                    </span>
                  </span>
                  {isActive && (
                    <span style={{ fontSize: "calc(16px * var(--font-scale))", color: "var(--primary)", alignSelf: "center", flexShrink: 0 }}>✓</span>
                  )}
                  {!isPro && (
                    <span style={{ fontSize: "calc(13px * var(--font-scale))", fontWeight: 600, color: "var(--primary)", alignSelf: "center", whiteSpace: "nowrap", flexShrink: 0, marginLeft: "auto" }}>
                      Upgrade →
                    </span>
                  )}
                </>
              );

              return isPro ? (
                <button
                  type="button"
                  onClick={() => setGenerationMode(GenerationMode.DEEP_DIVE)}
                  className={`chip-card${isActive ? " chip-card-active" : ""}`}
                  style={cardStyle}
                >
                  {content}
                </button>
              ) : (
                <a href={Routes.upgrade} className="chip-card" style={cardStyle}>
                  {content}
                </a>
              );
            })()}
          </div>

          <div
            style={{ display: "flex", flexDirection: "column", gap: 10, border: "1.5px solid var(--border)", background: "var(--bg-card)", borderRadius: 20, padding: 18 }}
          >
            <p
              style={{ fontSize: "calc(12px * var(--font-scale))", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-faint)", margin: 0 }}
            >
              Deck settings
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: "calc(13px * var(--font-scale))", fontWeight: 500, color: "var(--text-muted)", minWidth: 110 }}>
                Deck name
              </span>
              <input
                type="text"
                value={deckName}
                onChange={(e) => setDeckName(e.target.value)}
                maxLength={Validation.deck.titleMaxLength}
                placeholder="e.g. Ecology Midterms"
                style={{ flex: 1, minWidth: 180, borderRadius: 10, padding: "8px 14px", fontSize: "calc(14px * var(--font-scale))", outline: "none", border: "1px solid var(--border)", background: "var(--bg-subtle)", color: "var(--text)", fontFamily: "var(--font-body, sans-serif)" }}
              />
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: "calc(13px * var(--font-scale))", fontWeight: 500, color: "var(--text-muted)", minWidth: 110 }}>
                Cards to generate
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                {CardCountOptions.map((count) => {
                  const locked = count > tierMaxCards;
                  return (
                    <button
                      key={count}
                      type="button"
                      onClick={() => (locked ? router.push(Routes.upgrade) : setCardCount(count))}
                      title={locked ? "You'll need Pro for this — tap to upgrade" : undefined}
                      className={`chip${cardCount === count ? " chip-active" : ""}`}
                      style={{
                        border: cardCount === count ? "1.5px solid var(--primary)" : "1.5px solid var(--border)",
                        background: cardCount === count ? "var(--primary)" : "var(--bg-subtle)",
                        color: cardCount === count ? "var(--on-primary)" : "var(--text)",
                        borderRadius: 999,
                        padding: "5px 14px",
                        fontSize: "calc(13px * var(--font-scale))",
                        fontWeight: 600,
                        cursor: "pointer",
                        opacity: locked ? 0.6 : 1,
                        fontFamily: "var(--font-body, sans-serif)",
                      }}
                    >
                      {count}{locked ? " 🔒" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <button
              type="button"
              onClick={handleCancel}
              className="btn-outline"
              style={{ border: "1.5px solid var(--border)", color: "var(--text)", background: "none", borderRadius: 10, padding: "8px 20px", fontSize: "calc(14px * var(--font-scale))", fontWeight: 600, fontFamily: "var(--font-body, sans-serif)", cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={selectedFiles.length === 0}
              onClick={handleGenerateClick}
              className="btn-solid"
              style={{ background: "var(--primary)", color: "var(--on-primary)", border: "none", borderRadius: 10, padding: "8px 20px", fontSize: "calc(14px * var(--font-scale))", fontWeight: 600, fontFamily: "var(--font-body, sans-serif)", cursor: selectedFiles.length > 0 ? "pointer" : "not-allowed", opacity: selectedFiles.length > 0 ? 1 : 0.5 }}
            >
              Generate flashcards
            </button>
          </div>
        </>
      )}

      {(phase === "uploading" || phase === "generating") && (() => {
        const extracting = phase === "uploading";
        const rows: Array<{ label: string; state: "done" | "active" | "pending" }> = [
          {
            label: pageProgress.total > 0 ? `Extracted text from ${pageProgress.total} pages` : "Extracted your text",
            state: extracting ? "active" : "done",
          },
          { label: "Finding key concepts…", state: extracting ? "pending" : genStage === 1 ? "active" : "done" },
          { label: "Writing your flashcards", state: extracting || genStage === 1 ? "pending" : "active" },
        ];
        const progressPercent = extracting ? 20 : genStage === 1 ? 55 : 85;

        return (
          <div
            className="anim-fade-up"
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, borderRadius: 20, padding: "32px 24px", border: "1.5px solid var(--border)", background: "var(--bg-card)", textAlign: "center", fontFamily: "var(--font-body, sans-serif)" }}
            role="status"
            aria-live="polite"
          >
            <img
              src="/capy/capy-reading.png"
              alt=""
              width={120}
              height={120}
              className="capy-reading-bob"
              style={{ width: 120, height: "auto" }}
            />
            <div>
              <p style={{ margin: 0, fontFamily: "var(--font-display, serif)", fontSize: "calc(18px * var(--font-scale))", fontWeight: 600, color: "var(--text)" }}>
                {extracting && fileProgress && fileProgress.total > 1
                  ? `Reading ${fileProgress.current} of ${fileProgress.total} — ${fileProgress.filename}`
                  : "Reading your PDF, hang tight…"}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: "calc(13px * var(--font-scale))", color: "var(--text-muted)" }}>
                {deckName.trim() || "Your deck"} · generating {cardCount} cards
              </p>
            </div>

            {batchFailures.length > 0 && (
              <div style={{ width: "100%", maxWidth: 360, borderRadius: 10, padding: "10px 14px", background: "var(--bg-subtle)", border: "1.5px solid var(--border)", textAlign: "left" }}>
                <p style={{ margin: 0, fontSize: "calc(12.5px * var(--font-scale))", fontWeight: 600, color: "var(--text)" }}>
                  {batchFailures.length === 1 ? "1 file was skipped" : `${batchFailures.length} files were skipped`}
                </p>
                {batchFailures.map((f) => (
                  <p key={f.filename} style={{ margin: "4px 0 0", fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)" }}>
                    <strong>{f.filename}</strong>: {f.message}
                  </p>
                ))}
              </div>
            )}

            {budgetWarning && (
              <div style={{ width: "100%", maxWidth: 360, borderRadius: 10, padding: "10px 14px", background: "var(--bg-subtle)", border: "1.5px solid var(--border)", textAlign: "left" }}>
                <p style={{ margin: 0, fontSize: "calc(12.5px * var(--font-scale))", fontWeight: 600, color: "var(--text)" }}>
                  ⚠ Some content was trimmed
                </p>
                <p style={{ margin: "4px 0 0", fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)" }}>
                  {budgetWarning}
                </p>
              </div>
            )}

            <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 6 }}>
              {rows.map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 14px",
                    borderRadius: 10,
                    background: row.state === "active" ? "var(--bg-subtle)" : "transparent",
                    fontSize: "calc(13px * var(--font-scale))",
                    color: row.state === "pending" ? "var(--text-faint)" : "var(--text)",
                  }}
                >
                  <span
                    style={{
                      width: 14,
                      textAlign: "center",
                      color: row.state === "done" ? "var(--success)" : row.state === "active" ? "var(--primary)" : "var(--text-faint)",
                    }}
                  >
                    {row.state === "done" ? "✓" : row.state === "active" ? "●" : "○"}
                  </span>
                  {row.label}
                </div>
              ))}
            </div>

            <div style={{ width: "100%", maxWidth: 360, height: 6, borderRadius: 999, overflow: "hidden", background: "var(--border)" }}>
              <div style={{ height: "100%", width: `${progressPercent}%`, borderRadius: 999, background: "var(--primary)", transition: "width 0.4s ease" }} />
            </div>

            <p style={{ margin: 0, fontSize: "calc(12px * var(--font-scale))", color: "var(--text-faint)" }}>
              {tokenBalance !== null
                ? `Capy will use 1 Capycoin · ${Math.max(0, tokenBalance - 1)} remaining`
                : "Capy will use 1 Capycoin for this."}
            </p>
          </div>
        );
      })()}

      {phase === "ocr_running" && (
        <div
          className="anim-fade-up"
          style={{ borderRadius: 16, padding: "20px 24px", border: "1.5px solid var(--border)", background: "var(--bg-card)", fontFamily: "var(--font-body, sans-serif)" }}
          role="status"
          aria-live="polite"
        >
          <p style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--text)", margin: 0 }}>
            {fileProgress && fileProgress.total > 1
              ? `OCR: file ${fileProgress.current} of ${fileProgress.total} — ${fileProgress.filename}`
              : pageProgress.total > 0
                ? UIMessages.ocrProgress(pageProgress.current, pageProgress.total)
                : "Preparing OCR…"}
          </p>
          {fileProgress && fileProgress.total > 1 && pageProgress.total > 0 && (
            <p style={{ fontSize: "calc(12.5px * var(--font-scale))", color: "var(--text-muted)", margin: "6px 0 0" }}>
              {UIMessages.ocrProgress(pageProgress.current, pageProgress.total)}
            </p>
          )}
          <div style={{ marginTop: 12, height: 8, overflow: "hidden", borderRadius: 999, background: "var(--border)" }}>
            <div
              style={{
                height: "100%",
                borderRadius: 999,
                transition: "width 0.3s ease",
                background: "var(--primary)",
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
        <div
          className="anim-fade-up"
          style={{ display: "flex", flexDirection: "column", gap: 16, borderRadius: 20, padding: 24, border: "1.5px solid var(--border)", background: "var(--bg-card)", fontFamily: "var(--font-body, sans-serif)" }}
        >
          <p style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--text)", margin: 0 }}>
            {UIMessages.ocrFallbackPrompt}
          </p>
          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            rows={12}
            style={{ width: "100%", resize: "vertical", borderRadius: 10, padding: "10px 14px", fontSize: "calc(14px * var(--font-scale))", outline: "none", border: "1px solid var(--border)", background: "var(--bg-subtle)", color: "var(--text)", fontFamily: "var(--font-body, sans-serif)", boxSizing: "border-box" }}
            placeholder="Paste your lecture notes or handout text here…"
          />
          {errorMessage && (
            <p style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--error)", margin: 0 }} role="alert">
              {errorMessage}
            </p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <button
              type="button"
              disabled={isBusy}
              onClick={submitPaste}
              className="btn-solid"
              style={{ borderRadius: 10, padding: "10px 20px", fontSize: "calc(14px * var(--font-scale))", fontWeight: 600, border: "none", cursor: isBusy ? "not-allowed" : "pointer", opacity: isBusy ? 0.5 : 1, background: "var(--primary)", color: "var(--on-primary)", fontFamily: "var(--font-body, sans-serif)" }}
            >
              {PDF_EXTRACTION_TEST_MODE ? "Show paste output" : "Generate flashcards"}
            </button>
            <button
              type="button"
              onClick={resetToIdle}
              className="nav-link"
              style={{ borderRadius: 10, padding: "10px 20px", fontSize: "calc(14px * var(--font-scale))", cursor: "pointer", color: "var(--text-muted)", background: "none", border: "none", fontFamily: "var(--font-body, sans-serif)" }}
            >
              Start over
            </button>
          </div>
        </div>
      )}

      {phase === "result" && resultView && (
        <div
          className="anim-fade-up"
          style={{ display: "flex", flexDirection: "column", gap: 16, borderRadius: 20, padding: 24, border: "1.5px solid var(--success)", background: "var(--success-bg)", fontFamily: "var(--font-body, sans-serif)" }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <h3 style={{ fontSize: "calc(14px * var(--font-scale))", fontWeight: 600, color: "var(--success-dark)", margin: 0 }}>
              {resultView.label}
            </h3>
            <button
              type="button"
              onClick={resetToIdle}
              className="btn-outline"
              style={{ borderRadius: 10, padding: "6px 14px", fontSize: "calc(12px * var(--font-scale))", fontWeight: 600, cursor: "pointer", border: "1.5px solid var(--border)", color: "var(--text)", background: "none", fontFamily: "var(--font-body, sans-serif)" }}
            >
              Upload another PDF
            </button>
          </div>

          {resultView.cards && resultView.cards.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ fontSize: "calc(12px * var(--font-scale))", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-faint)", margin: 0 }}>
                Generated flashcards ({resultView.cards.length})
              </p>
              <ul style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 384, overflow: "auto", margin: 0, padding: 0, listStyle: "none" }}>
                {resultView.cards.map((card, i) => (
                  <li
                    key={i}
                    style={{ borderRadius: 10, padding: 12, fontSize: "calc(14px * var(--font-scale))", border: "1px solid var(--border)", background: "var(--bg-card)" }}
                  >
                    <p style={{ fontWeight: 600, color: "var(--text)", margin: 0 }}>
                      {card.front}
                    </p>
                    <p style={{ marginTop: 4, marginBottom: 0, color: "var(--text-muted)" }}>{card.back}</p>
                    {card.tags.length > 0 && (
                      <p style={{ marginTop: 8, marginBottom: 0, fontSize: "calc(12px * var(--font-scale))", color: "var(--text-faint)" }}>
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
              <summary style={{ cursor: "pointer", fontSize: "calc(12px * var(--font-scale))", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-faint)" }}>
                Extracted text preview
              </summary>
              <pre
                style={{ marginTop: 8, maxHeight: 192, overflow: "auto", borderRadius: 10, padding: 12, fontSize: "calc(12px * var(--font-scale))", whiteSpace: "pre-wrap", border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-muted)" }}
              >
                {resultView.extractedText || "(empty)"}
              </pre>
            </details>
          )}

          {resultView.debug != null && (
            <details>
              <summary style={{ cursor: "pointer", fontSize: "calc(12px * var(--font-scale))", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-faint)" }}>
                Pipeline debug JSON
              </summary>
              <pre
                style={{ marginTop: 8, maxHeight: 192, overflow: "auto", borderRadius: 10, padding: 12, fontSize: "calc(12px * var(--font-scale))", border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-muted)" }}
              >
                {JSON.stringify(resultView.debug, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}

      {phase === "error" && (
        <div
          className="anim-fade-up"
          style={{ display: "flex", flexDirection: "column", gap: 12, borderRadius: 20, padding: 24, border: "1.5px solid var(--error)", background: "var(--error-bg)", fontFamily: "var(--font-body, sans-serif)" }}
        >
          <p style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--error-dark)", margin: 0 }} role="alert">
            {errorMessage}
          </p>
          {selectedFiles.length > 0 && (
            <>
              <p style={{ fontSize: "calc(12.5px * var(--font-scale))", fontWeight: 600, color: "var(--text)", margin: "4px 0 0" }}>
                Your files
              </p>
              <ul style={{ display: "flex", flexDirection: "column", gap: 6, margin: 0, padding: 0, listStyle: "none" }}>
                {selectedFiles.map((f, i) => {
                  const status = fileStatuses[i] ?? "queued";
                  const chipColor =
                    status === "done" ? "var(--success)"
                    : status === "skipped" ? "var(--error)"
                    : status === "reading" ? "var(--primary)"
                    : "var(--text-faint)";
                  const chipLabel =
                    status === "done" ? "done"
                    : status === "skipped" ? "failed"
                    : status === "reading" ? "reading…"
                    : "queued";
                  return (
                    <li
                      key={`${f.name}-${i}`}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 10px", borderRadius: 8, background: "var(--bg-subtle)", fontSize: "calc(12.5px * var(--font-scale))", color: "var(--text)" }}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.name}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <span
                          style={{
                            fontSize: "calc(10.5px * var(--font-scale))",
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            color: chipColor,
                            border: "1px solid ".concat(chipColor),
                            borderRadius: 999,
                            padding: "1px 8px",
                          }}
                        >
                          {chipLabel}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeSelectedFile(i)}
                          aria-label={`Remove ${f.name}`}
                          style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: "calc(14px * var(--font-scale))", lineHeight: 1, padding: "2px 6px" }}
                        >
                          ✕
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button
              type="button"
              onClick={handleGenerateClick}
              disabled={selectedFiles.length === 0}
              className="btn-solid"
              style={{ borderRadius: 10, padding: "10px 20px", fontSize: "calc(14px * var(--font-scale))", fontWeight: 600, border: "none", cursor: selectedFiles.length > 0 ? "pointer" : "not-allowed", opacity: selectedFiles.length > 0 ? 1 : 0.5, background: "var(--primary)", color: "var(--on-primary)", fontFamily: "var(--font-body, sans-serif)" }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={resetToIdle}
              className="btn-outline"
              style={{ borderRadius: 10, padding: "10px 20px", fontSize: "calc(14px * var(--font-scale))", fontWeight: 600, cursor: "pointer", border: "1.5px solid var(--border)", color: "var(--text-muted)", background: "none", fontFamily: "var(--font-body, sans-serif)" }}
            >
              Start over
            </button>
          </div>
        </div>
      )}

      {!PDF_EXTRACTION_TEST_MODE && phase === "generating" && (
        <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-faint)" }}>{UIMessages.aiDisclaimer}</p>
      )}
    </div>
  );
}
