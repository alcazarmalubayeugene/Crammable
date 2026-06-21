"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiErrorCode,
  ApiPaths,
  App,
  CardCountOptions,
  GenerationMode,
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
  type UploadResult,
} from "@/lib/contracts";
import type { UploadTestDebug } from "@/app/api/upload/route";
import { PDF_EXTRACTION_TEST_MODE } from "@/lib/dev/pdf-test-mode";
import { authHeaders } from "@/lib/api/auth-headers";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
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
  const [pastedText, setPastedText]           = useState("");
  const [errorMessage, setErrorMessage]       = useState("");
  const [statusLine, setStatusLine]           = useState("");
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

  // ── Deck settings (name + card count) ───────────────────────────────────────
  const [deckName, setDeckName] = useState("");
  const [cardCount, setCardCount] = useState<(typeof CardCountOptions)[number]>(10);
  const tierMaxCards = TierLimits[subscriptionTier].maxCardsPerDeck;

  // File is attached on selection but generation only starts when the user
  // explicitly clicks "Generate flashcards" — lets deck settings be filled in first.
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    async function checkConsent() {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setConsentChecked(true); return; }
      const { data } = await supabase
        .from(TableNames.profiles)
        .select("consent_deepseek, subscription_tier")
        .eq("id", user.id)
        .single();
      setHasConsented(data?.consent_deepseek === true);
      if (data?.subscription_tier) {
        setSubscriptionTier(data.subscription_tier as (typeof SubscriptionTier)[keyof typeof SubscriptionTier]);
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
    setSelectedFile(null);
    setPdfFile(null);
    setOcrMessage("");
    setPageProgress({ current: 0, total: 0 });
    setPastedText("");
    setErrorMessage("");
    setStatusLine("");
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
    [router, generationMode, deckName, cardCount],
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

      const imgPages = data.imagePageNumbers;
      setImagePageNumbers(imgPages);
      setPartialText(data.partialText);
      setPdfFile(file);
      // Give a more specific prompt when we already have some good text and know exactly
      // which pages need scanning.
      const scanNote =
        imgPages.length > 0
          ? ` ${imgPages.length} page${imgPages.length === 1 ? "" : "s"} will be scanned${data.partialText ? " (other pages already extracted)" : ""}.`
          : "";
      setOcrMessage(data.message + scanNote);
      setLayer1Payload(data);
      setPhase("ocr_confirm");
    },
    [callGenerate, showExtractionPreview],
  );

  const onFileSelected = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setSelectedFile(file);
    },
    [],
  );

  const handleGenerateClick = useCallback(async () => {
    if (!selectedFile) return;
    await uploadPdf(selectedFile);
  }, [selectedFile, uploadPdf]);

  const handleCancel = useCallback(() => {
    router.push(Routes.dashboard);
  }, [router]);

  const runClientOcr = useCallback(async () => {
    if (!pdfFile) return;

    setPhase("ocr_running");
    setErrorMessage("");
    setResultView(null);

    try {
      // Only render pages the server flagged as sparse — skips pages that already
      // have good embedded text, saving significant time on mixed PDFs.
      const pagesToOcr = imagePageNumbers.length > 0 ? imagePageNumbers : undefined;

      const rendered = await renderPdfPagesToCanvases(
        pdfFile,
        (current, total) => {
          setPageProgress({ current, total });
          setStatusLine(UIMessages.ocrProgress(current, total));
        },
        pagesToOcr,
      );

      const ocrResult = await runOcrOnPages(rendered, (current, total) => {
        setPageProgress({ current, total });
        setStatusLine(UIMessages.ocrProgress(current, total));
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
  }, [pdfFile, imagePageNumbers, partialText, callGenerate, showExtractionPreview]);

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
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{ border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-muted)" }}
        >
          Checking account…
        </div>
      </div>
    );
  }

  if (!hasConsented) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header>
          <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>Upload PDF</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>One quick step before you continue.</p>
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
    <div className="anim-fade-up mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
          Upload PDF
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          {PDF_EXTRACTION_TEST_MODE ? (
            <>
              <span className="font-medium" style={{ color: "var(--primary)" }}>
                Extraction test mode
              </span>
              {" — "}
              DeepSeek generate is off. Set PDF_EXTRACTION_TEST_MODE to false in{" "}
              <code className="text-xs">src/lib/dev/pdf-test-mode.ts</code>.
            </>
          ) : (
            <>
              Upload a handout (max {MAX_UPLOAD_SIZE_MB} MB). {App.name} extracts text, then
              sends it to DeepSeek to build flashcards. One Capycoin is used only after cards
              are generated successfully.
            </>
          )}
        </p>
      </header>

      {phase === "idle" && (
        <>
          <div className="mb-4 flex flex-col gap-2">
            <p
              className="px-1 text-xs font-semibold uppercase"
              style={{ color: "var(--text-faint)", letterSpacing: "0.06em" }}
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
                padding: "14px 18px",
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
                padding: "14px 18px",
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

          <label
            className="upload-dropzone mb-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-12"
            style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}
          >
            <span style={{ fontSize: "calc(32px * var(--font-scale))", lineHeight: 1 }}>📄</span>
            {selectedFile ? (
              <>
                <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {selectedFile.name}
                </span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB selected — click to change
                </span>
              </>
            ) : (
              <>
                <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  Drop your PDF here
                </span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  or click to browse — max {MAX_UPLOAD_SIZE_MB} MB
                </span>
              </>
            )}
            <span
              className="btn-outline mt-1 rounded-lg px-4 py-1.5 text-xs font-medium"
              style={{ border: "1.5px solid var(--border)", color: "var(--text)" }}
            >
              Choose file
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={onFileSelected}
            />
          </label>

          <div
            className="mb-4 flex flex-col gap-3 rounded-xl p-4"
            style={{ border: "1.5px solid var(--border)", background: "var(--bg-card)" }}
          >
            <p
              className="px-1 text-xs font-semibold uppercase"
              style={{ color: "var(--text-faint)", letterSpacing: "0.06em" }}
            >
              Deck settings
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium" style={{ color: "var(--text-muted)", minWidth: 90 }}>
                Deck name
              </span>
              <input
                type="text"
                value={deckName}
                onChange={(e) => setDeckName(e.target.value)}
                maxLength={Validation.deck.titleMaxLength}
                placeholder="e.g. Ecology Midterms"
                className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                style={{ border: "1px solid var(--border)", background: "var(--bg-subtle)", color: "var(--text)", minWidth: 180 }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium" style={{ color: "var(--text-muted)", minWidth: 90 }}>
                Cards to generate
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {CardCountOptions.map((count) => {
                  const locked = count > tierMaxCards;
                  return (
                    <button
                      key={count}
                      type="button"
                      disabled={locked}
                      onClick={() => setCardCount(count)}
                      title={locked ? "Upgrade to Pro for more cards per deck" : undefined}
                      className={`chip${cardCount === count ? " chip-active" : ""}`}
                      style={{
                        border: cardCount === count ? "1.5px solid var(--primary)" : "1.5px solid var(--border)",
                        background: cardCount === count ? "var(--primary)" : "var(--bg-subtle)",
                        color: cardCount === count ? "var(--on-primary)" : "var(--text)",
                        borderRadius: 999,
                        padding: "6px 14px",
                        fontSize: "calc(13px * var(--font-scale))",
                        fontWeight: 600,
                        cursor: locked ? "not-allowed" : "pointer",
                        opacity: locked ? 0.5 : 1,
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

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleCancel}
              className="btn-outline rounded-lg px-5 py-2 text-sm font-medium"
              style={{ border: "1.5px solid var(--border)", color: "var(--text)", background: "none" }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selectedFile}
              onClick={handleGenerateClick}
              className="btn-solid rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "var(--primary)", color: "var(--on-primary)" }}
            >
              Generate flashcards
            </button>
          </div>
        </>
      )}

      {(phase === "uploading" || phase === "generating") && (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{ border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text)" }}
          role="status"
        >
          {statusLine || "Working…"}
        </div>
      )}

      {phase === "ocr_confirm" && pdfFile && (
        <div
          className="flex flex-col gap-4 rounded-xl p-5"
          style={{ border: "1px solid var(--border)", background: "var(--bg-subtle)" }}
        >
          <p className="text-sm" style={{ color: "var(--text)" }}>{ocrMessage}</p>
          {layer1Payload != null ? (
            <details className="rounded-lg" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium" style={{ color: "var(--text)" }}>
                Layer 1 server response (JSON)
              </summary>
              <pre className="max-h-48 overflow-auto px-3 pb-3 text-xs" style={{ color: "var(--text-muted)" }}>
                {JSON.stringify(layer1Payload, null, 2)}
              </pre>
            </details>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={runClientOcr}
              className="btn-solid rounded-lg px-4 py-2 text-sm font-medium"
              style={{ background: "var(--primary)", color: "var(--on-primary)" }}
            >
              Continue (Layer 2 OCR)
            </button>
            <button
              type="button"
              onClick={() => {
                setPhase("paste_fallback");
                setStatusLine("");
              }}
              className="btn-outline rounded-lg px-4 py-2 text-sm font-medium"
              style={{ border: "1.5px solid var(--border)", color: "var(--text)", background: "none" }}
            >
              Paste text instead
            </button>
            <button
              type="button"
              onClick={resetToIdle}
              className="nav-link rounded-lg px-4 py-2 text-sm"
              style={{ color: "var(--text-muted)", background: "none", border: "none" }}
            >
              Start over
            </button>
          </div>
        </div>
      )}

      {phase === "ocr_running" && (
        <div
          className="rounded-lg px-4 py-3"
          style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}
          role="status"
          aria-live="polite"
        >
          <p className="text-sm" style={{ color: "var(--text)" }}>
            {pageProgress.total > 0
              ? UIMessages.ocrProgress(pageProgress.current, pageProgress.total)
              : "Preparing OCR…"}
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
            <div
              className="h-full transition-all duration-300"
              style={{
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
          className="flex flex-col gap-4 rounded-xl p-5"
          style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}
        >
          <p className="text-sm" style={{ color: "var(--text)" }}>
            {UIMessages.ocrFallbackPrompt}
          </p>
          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            rows={12}
            className="w-full resize-y rounded-lg px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid var(--border)", background: "var(--bg-subtle)", color: "var(--text)" }}
            placeholder="Paste your lecture notes or handout text here…"
          />
          {errorMessage && (
            <p className="text-sm" style={{ color: "var(--error)" }} role="alert">
              {errorMessage}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={isBusy}
              onClick={submitPaste}
              className="btn-solid rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
              style={{ background: "var(--primary)", color: "var(--on-primary)" }}
            >
              {PDF_EXTRACTION_TEST_MODE ? "Show paste output" : "Generate flashcards"}
            </button>
            <button
              type="button"
              onClick={resetToIdle}
              className="nav-link rounded-lg px-4 py-2 text-sm"
              style={{ color: "var(--text-muted)", background: "none", border: "none" }}
            >
              Start over
            </button>
          </div>
        </div>
      )}

      {phase === "result" && resultView && (
        <div
          className="flex flex-col gap-4 rounded-xl p-5"
          style={{ border: "1px solid var(--success)", background: "var(--success-bg)" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold" style={{ color: "var(--success-dark)" }}>
              {resultView.label}
            </h3>
            <button
              type="button"
              onClick={resetToIdle}
              className="btn-outline rounded-lg px-3 py-1.5 text-xs font-medium"
              style={{ border: "1.5px solid var(--border)", color: "var(--text)", background: "none" }}
            >
              Upload another PDF
            </button>
          </div>

          {resultView.cards && resultView.cards.length > 0 && (
            <div className="flex flex-col gap-3">
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                Generated flashcards ({resultView.cards.length})
              </p>
              <ul className="flex max-h-96 flex-col gap-2 overflow-auto">
                {resultView.cards.map((card, i) => (
                  <li
                    key={i}
                    className="rounded-lg p-3 text-sm"
                    style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}
                  >
                    <p className="font-medium" style={{ color: "var(--text)" }}>
                      {card.front}
                    </p>
                    <p className="mt-1" style={{ color: "var(--text-muted)" }}>{card.back}</p>
                    {card.tags.length > 0 && (
                      <p className="mt-2 text-xs" style={{ color: "var(--text-faint)" }}>
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
              <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                Extracted text preview
              </summary>
              <pre
                className="mt-2 max-h-48 overflow-auto rounded-lg p-3 text-xs whitespace-pre-wrap"
                style={{ border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-muted)" }}
              >
                {resultView.extractedText || "(empty)"}
              </pre>
            </details>
          )}

          {resultView.debug != null && (
            <details>
              <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                Pipeline debug JSON
              </summary>
              <pre
                className="mt-2 max-h-48 overflow-auto rounded-lg p-3 text-xs"
                style={{ border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-muted)" }}
              >
                {JSON.stringify(resultView.debug, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}

      {phase === "error" && (
        <div
          className="flex flex-col gap-3 rounded-xl p-5"
          style={{ border: "1px solid var(--error)", background: "var(--error-bg)" }}
        >
          <p className="text-sm" style={{ color: "var(--error-dark)" }} role="alert">
            {errorMessage}
          </p>
          <button
            type="button"
            onClick={resetToIdle}
            className="btn-solid self-start rounded-lg px-4 py-2 text-sm font-medium"
            style={{ background: "var(--primary)", color: "var(--on-primary)" }}
          >
            Try again
          </button>
        </div>
      )}

      {!PDF_EXTRACTION_TEST_MODE && phase === "generating" && (
        <p className="text-xs" style={{ color: "var(--text-faint)" }}>{UIMessages.aiDisclaimer}</p>
      )}
    </div>
  );
}
