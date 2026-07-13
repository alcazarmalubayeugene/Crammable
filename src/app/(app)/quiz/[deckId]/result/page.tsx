"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { App, Routes } from "@/lib/contracts";
import { Navbar } from "@/components/nav/Navbar";
import { QUIZ_RESULT_KEY, type QuizResultData } from "../page";
import { useCustomAvatar } from "@/lib/theme/customAvatar";

// ── shared styles ─────────────────────────────────────────────────────────────

const cardStyle = {
  background: "var(--bg-card)",
  border: "1.5px solid var(--border)",
  borderRadius: 16,
  padding: "18px 20px",
  marginBottom: 24,
} as const;

// ── helpers ───────────────────────────────────────────────────────────────────

function scoreLabel(pct: number): { color: string } {
  if (pct >= 90) return { color: "var(--success)" };
  if (pct >= 60) return { color: "var(--primary)" };
  return { color: "var(--text-muted)" };
}

// Capy's reaction message, banded by score — the "Capy Calm" companion voice
// (concept #7) instead of a flat "Great job!" label.
function reactionMessage(pct: number): { headline: string; detail: string } {
  if (pct >= 90) {
    return {
      headline: `Grabe, ${pct}%! Capy's impressed. 🏆`,
      detail: "Almost a clean sweep — one more pass and you'll own this chapter completely.",
    };
  }
  if (pct >= 75) {
    return {
      headline: `Grabe ka! ${pct}% — Capy's impressed. 🎉`,
      detail: "One more round and you'll own this chapter. Hindi ka pa tapos.",
    };
  }
  if (pct >= 60) {
    return {
      headline: `Hindi naman pangit, ${pct}%. 📚`,
      detail: "A bit more review on the missed ones and these will stick for good.",
    };
  }
  return {
    headline: "Nice try, better review next time! 💪",
    detail: "Every miss just tells Capy exactly what to drill with you next.",
  };
}

const secondaryBtnStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  background: "var(--bg-card)",
  color: "var(--text)",
  border: "1.5px solid var(--border)",
  padding: "12px 24px",
  borderRadius: 10,
  fontWeight: 600,
  fontSize: "calc(14px * var(--font-scale))",
  textDecoration: "none",
  cursor: "pointer",
  fontFamily: "var(--font-body, sans-serif)",
} as const;

const primaryBtnStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  background: "var(--primary)",
  color: "var(--nav-text)",
  padding: "12px 24px",
  borderRadius: 10,
  fontWeight: 600,
  fontSize: "calc(14px * var(--font-scale))",
  textDecoration: "none",
} as const;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Wraps text onto multiple centered lines within maxWidth, returns lines drawn.
function wrapCenteredText(ctx: CanvasRenderingContext2D, text: string, centerX: number, startY: number, maxWidth: number, lineHeight: number): number {
  const words = text.split(" ");
  let line = "";
  let y = startY;
  let lines = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, centerX, y);
      line = word;
      y += lineHeight;
      lines += 1;
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, centerX, y);
    lines += 1;
  }
  return lines;
}

// Renders a static, client-side-only share card for the result — no backend
// involved (no per-result deep link, since that would need a new public read
// endpoint). The image is generic branding + this result's numbers; the link
// shared alongside it is just the app's homepage.
async function buildShareCardBlob(opts: {
  scorePercent: number;
  correctCount: number;
  totalQuestions: number;
  deckTitle?: string;
  headline: string;
  isPerfect: boolean;
}): Promise<Blob | null> {
  const size = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const bg = cssVar("--bg") || "#FAF2E4";
  const bgCard = cssVar("--bg-card") || "#FFFCF7";
  const border = cssVar("--border") || "#E0C9A8";
  const text = cssVar("--text") || "#2E1A0C";
  const textMuted = cssVar("--text-muted") || text;
  const primary = cssVar("--primary") || "#C47A2E";
  const success = cssVar("--success") || "#5C7A35";
  const displayFont = "'Lora', serif";
  const bodyFont = "'Inter', sans-serif";

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  const pad = 56;
  ctx.fillStyle = bgCard;
  ctx.strokeStyle = border;
  ctx.lineWidth = 3;
  const cardR = 36;
  ctx.beginPath();
  ctx.roundRect(pad, pad, size - pad * 2, size - pad * 2, cardR);
  ctx.fill();
  ctx.stroke();

  try {
    const mascot = await loadImage(opts.isPerfect ? "/capy/congrats-capy.png" : "/capy/capy-reading.png");
    const mw = 220;
    const mh = (mascot.height / mascot.width) * mw;
    ctx.drawImage(mascot, size / 2 - mw / 2, pad + 50, mw, mh);
  } catch {
    // mascot art failed to load — still render the rest of the card
  }

  ctx.textAlign = "center";
  ctx.fillStyle = opts.isPerfect ? success : primary;
  ctx.font = `700 100px ${displayFont}`;
  ctx.fillText(`${opts.correctCount}/${opts.totalQuestions}`, size / 2, 470);

  ctx.fillStyle = textMuted;
  ctx.font = `600 32px ${bodyFont}`;
  ctx.fillText(`${opts.scorePercent}% score`, size / 2, 520);

  ctx.fillStyle = text;
  ctx.font = `700 36px ${displayFont}`;
  const headlineLines = wrapCenteredText(ctx, opts.headline, size / 2, 590, size - pad * 2 - 80, 46);

  if (opts.deckTitle) {
    ctx.fillStyle = textMuted;
    ctx.font = `italic 28px ${bodyFont}`;
    ctx.fillText(`${opts.deckTitle} Quiz`, size / 2, 590 + headlineLines * 46 + 30);
  }

  ctx.fillStyle = primary;
  ctx.font = `700 34px ${displayFont}`;
  ctx.fillText(App.name, size / 2, size - pad - 36);

  ctx.fillStyle = textMuted;
  ctx.font = `26px ${bodyFont}`;
  ctx.fillText(App.tagline, size / 2, size - pad - 4);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function QuizResultPage() {
  const params = useParams();
  const deckId = Array.isArray(params.deckId)
    ? params.deckId[0]
    : (params.deckId as string);

  // Parse the result during render (lazy init) rather than in an effect —
  // avoids the cascading-render lint and reads sessionStorage exactly once.
  // Guarded for SSR, where sessionStorage doesn't exist.
  const [result] = useState<QuizResultData | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem(QUIZ_RESULT_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as QuizResultData;
    } catch {
      // malformed — just show the no-data state
      return null;
    }
  });
  const [showMissed, setShowMissed] = useState(false);
  const [avatarSrc] = useCustomAvatar();
  const missedRef = useRef<HTMLDivElement>(null);
  const [shareStatus, setShareStatus] = useState<"idle" | "working" | "shared" | "saved" | "error">("idle");

  // Shareable link toggle — mirrors decks/[id]/page.tsx's
  // toggleShare()/copyShareLink() exactly, just scoped to a quiz session
  // instead of a deck.
  const [isPublic, setIsPublic] = useState(false);
  const [linkSharing, setLinkSharing] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  // Mounts the ring at 0% then animates to the real score a tick later —
  // CSS transition on stroke-dasharray needs a value change to fire.
  const [ringAnimated, setRingAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRingAnimated(true), 80);
    return () => clearTimeout(t);
  }, []);

  // ── no result data ────────────────────────────────────────────────────────────

  if (!result) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "var(--bg)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          fontFamily: "var(--font-body, sans-serif)",
        }}
      >
        <p style={{ color: "var(--text-muted)", fontSize: "calc(15px * var(--font-scale))" }}>No quiz results found.</p>
        <a
          href={Routes.quiz(deckId)}
          style={{ color: "var(--primary)", textDecoration: "none", fontWeight: 600, fontSize: "calc(14px * var(--font-scale))" }}
        >
          Take the quiz →
        </a>
      </main>
    );
  }

  const { color } = scoreLabel(result.scorePercent);
  const missed = result.answers.filter((a) => !a.isCorrect);
  const isPerfect = result.scorePercent === 100;
  const { headline, detail } = reactionMessage(result.scorePercent);

  async function handleShareScore() {
    setShareStatus("working");
    try {
      const blob = await buildShareCardBlob({
        scorePercent: result!.scorePercent,
        correctCount: result!.correctCount,
        totalQuestions: result!.totalQuestions,
        deckTitle: result!.deckTitle,
        headline,
        isPerfect,
      });
      if (!blob) throw new Error("canvas unavailable");

      const homeUrl = `${window.location.origin}${Routes.home}`;
      const file = new File([blob], "crammable-score.png", { type: "image/png" });
      const shareText = `I scored ${result!.scorePercent}% on ${result!.deckTitle ? `${result!.deckTitle} ` : ""}Crammable! 🎉`;

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: App.name, text: shareText, url: homeUrl });
        setShareStatus("shared");
      } else {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "crammable-score.png";
        link.click();
        URL.revokeObjectURL(link.href);
        await navigator.clipboard?.writeText(homeUrl).catch(() => {});
        setShareStatus("saved");
      }
    } catch (err) {
      // AbortError = user dismissed the native share sheet, not a real failure
      setShareStatus(err instanceof Error && err.name === "AbortError" ? "idle" : "error");
    } finally {
      setTimeout(() => setShareStatus("idle"), 3000);
    }
  }

  async function toggleResultShare() {
    if (!result!.sessionId) return;
    setLinkSharing(true);
    setLinkError("");
    try {
      const res = await fetch(Routes.api.quizResultShare(result!.sessionId), {
        method: isPublic ? "DELETE" : "POST",
      });
      const data = (await res.json()) as { success: boolean; isPublic?: boolean; error?: { message: string } };
      if (!data.success || data.isPublic === undefined) {
        setLinkError(data.error?.message ?? "Couldn't update sharing yet — this needs a backend change, see FRONTEND.md.");
        return;
      }
      setIsPublic(data.isPublic);
    } catch {
      setLinkError("Couldn't update sharing yet — this needs a backend change, see FRONTEND.md.");
    } finally {
      setLinkSharing(false);
    }
  }

  async function copyResultLink() {
    if (!result!.sessionId || typeof window === "undefined") return;
    await navigator.clipboard.writeText(`${window.location.origin}${Routes.publicResult(result!.sessionId)}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        fontFamily: "var(--font-body, sans-serif)",
      }}
    >
      {/* ── NAVBAR ── */}
      <Navbar backHref={Routes.deck(deckId)} showWordmark={false} sectionLabel="Quiz Results" />

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 24px" }}>

        {/* Score card */}
        <div
          style={{
            background: "var(--bg-card)",
            border: "1.5px solid var(--border)",
            borderRadius: 20,
            padding: "40px 32px",
            textAlign: "center",
            marginBottom: 24,
          }}
        >
          {isPerfect ? (
            <>
              {/* Plain <img>, not next/image — Next's optimizer serves this as
                  lossy WebP to real browsers (Accept header negotiation) and
                  silently flattens the alpha channel onto white, which is
                  exactly the "white square" bug this image kept showing.
                  capy-reading.png below sidesteps the same optimizer for the
                  same reason. */}
              <img
                src="/capy/congrats-capy.png"
                alt="Capy celebrating"
                width={140}
                height={140}
                className="capy-reading-bob"
                style={{ margin: "0 auto 12px", display: "block", objectFit: "contain" }}
              />
              {/* The 🎉 is a decorative flourish, not part of the score — it lives
                  in an absolutely-positioned span outside the text flow so its
                  width doesn't pull the digits themselves off-center. */}
              <div style={{ position: "relative", display: "inline-block", marginBottom: 16 }}>
                <span
                  style={{
                    fontFamily: "var(--font-display, serif)",
                    fontSize: "calc(36px * var(--font-scale))",
                    fontWeight: 700,
                    color: "var(--primary)",
                    lineHeight: 1,
                  }}
                >
                  {result.correctCount} / {result.totalQuestions}
                </span>
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: "100%",
                    top: "50%",
                    transform: "translateY(-50%)",
                    marginLeft: 8,
                    fontSize: "calc(28px * var(--font-scale))",
                  }}
                >
                  🎉
                </span>
              </div>
              <div
                style={{
                  background: "var(--bg-subtle)",
                  border: "1.5px solid var(--border)",
                  borderRadius: 18,
                  padding: "16px 20px",
                  maxWidth: 440,
                  margin: "0 auto",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-display, serif)",
                    fontWeight: 700,
                    fontSize: "calc(16px * var(--font-scale))",
                    color: "var(--text)",
                    marginBottom: 4,
                  }}
                >
                  Perfect score! Capy&apos;s so proud. ✨
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: "calc(13px * var(--font-scale))", lineHeight: 1.5 }}>
                  You crushed it. Ibig sabihin talaga — ikaw na. 🔥
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{ position: "relative", width: 140, height: 140, margin: "0 auto 16px" }}>
                <svg viewBox="0 0 36 36" style={{ transform: "rotate(-90deg)", width: 140, height: 140 }}>
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" strokeWidth="2.2" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    fill="none"
                    stroke={color}
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeDasharray={`${ringAnimated ? result.scorePercent : 0} 100`}
                    style={{ transition: "stroke-dasharray 1.3s cubic-bezier(0.4,0,0.2,1)" }}
                  />
                </svg>
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
                  <div
                    style={{
                      fontFamily: "var(--font-display, serif)",
                      fontSize: "calc(40px * var(--font-scale))",
                      fontWeight: 700,
                      lineHeight: 1,
                      color,
                    }}
                  >
                    {result.correctCount}
                  </div>
                  <div style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-muted)", fontWeight: 600 }}>
                    of {result.totalQuestions}
                  </div>
                </div>
              </div>

              <p style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-faint)", marginBottom: 20 }}>
                {result.scorePercent}% score
              </p>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  background: "var(--bg-subtle)",
                  border: "1.5px solid var(--border)",
                  borderRadius: 18,
                  padding: "16px 20px",
                  maxWidth: 440,
                  margin: "0 auto",
                  textAlign: "left",
                }}
              >
                <img
                  src={avatarSrc}
                  alt=""
                  width={52}
                  height={52}
                  style={{ width: 52, height: 52, borderRadius: "50%", border: "2px solid var(--primary)", objectFit: "cover", flexShrink: 0 }}
                />
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-display, serif)",
                      fontWeight: 700,
                      fontSize: "calc(15px * var(--font-scale))",
                      color: "var(--text)",
                      marginBottom: 3,
                    }}
                  >
                    {headline}
                  </div>
                  <div style={{ color: "var(--text-muted)", fontSize: "calc(13px * var(--font-scale))", lineHeight: 1.5 }}>{detail}</div>
                </div>
              </div>
            </>
          )}

          {result.deckTitle && (
            <p
              style={{
                fontSize: "calc(13px * var(--font-scale))",
                color: "var(--text-faint)",
                marginTop: 16,
                fontStyle: "italic",
              }}
            >
              {result.deckTitle} Quiz
            </p>
          )}
        </div>

        {/* Share this result as a real link (mirrors decks/[id]'s share block). */}
        {result.sessionId && (
          <div
            style={{
              background: "var(--bg-card)",
              border: "1.5px solid var(--border)",
              borderRadius: 14,
              padding: "16px 18px",
              marginBottom: 24,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <p style={{ fontSize: "calc(13px * var(--font-scale))", fontWeight: 600, color: "var(--text)", margin: "0 0 2px" }}>
                  {isPublic ? "This result is public" : "Share this result"}
                </p>
                <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", margin: 0 }}>
                  {isPublic
                    ? "Anyone with the link can view your score (read-only)."
                    : "Get a real link anyone can open to see this score — not just a downloaded image."}
                </p>
              </div>
              <button
                type="button"
                onClick={toggleResultShare}
                disabled={linkSharing}
                style={{
                  background: isPublic ? "var(--bg-card)" : "var(--primary)",
                  border: isPublic ? "1.5px solid var(--border)" : "none",
                  color: isPublic ? "var(--text-muted)" : "var(--nav-text)",
                  padding: "8px 16px",
                  borderRadius: 8,
                  fontSize: "calc(13px * var(--font-scale))",
                  fontWeight: 600,
                  cursor: linkSharing ? "not-allowed" : "pointer",
                  fontFamily: "var(--font-body, sans-serif)",
                  whiteSpace: "nowrap",
                }}
              >
                {linkSharing ? "…" : isPublic ? "Make private" : "Make public"}
              </button>
            </div>

            {isPublic && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <code
                  style={{
                    fontSize: "calc(12px * var(--font-scale))",
                    color: "var(--text)",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    flex: 1,
                    minWidth: 200,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {Routes.publicResult(result.sessionId)}
                </code>
                <button
                  type="button"
                  onClick={copyResultLink}
                  style={{
                    background: linkCopied ? "var(--success)" : "var(--bg-card)",
                    color: linkCopied ? "#fff" : "var(--text)",
                    border: "1.5px solid var(--border)",
                    borderRadius: 8,
                    padding: "8px 14px",
                    fontSize: "calc(12px * var(--font-scale))",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "var(--font-body, sans-serif)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {linkCopied ? "Copied!" : "Copy link"}
                </button>
              </div>
            )}

            {linkError && (
              <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--error)", margin: 0 }}>{linkError}</p>
            )}
          </div>
        )}

        {/* Living Deck refresh banner */}
        {result.livingDeckRefreshTriggered && (
          <div style={{ ...cardStyle, borderColor: "var(--success)", background: "var(--success-bg)" }}>
            <p style={{ fontSize: "calc(14px * var(--font-scale))", fontWeight: 600, color: "var(--success-dark)", margin: "0 0 4px" }}>
              🌱 Living Deck refreshed
            </p>
            <p style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--success)", margin: 0, lineHeight: 1.5 }}>
              {result.reinforcedCardCount ?? 0} new{" "}
              {result.reinforcedCardCount === 1 ? "card was" : "cards were"} added to help
              reinforce your weak areas. (1 Capycoin used)
            </p>
          </div>
        )}

        {/* Pro upsell for Living Decks */}
        {result.upsellMessage && (
          <div style={{ ...cardStyle, borderColor: "var(--primary)", background: "var(--bg-subtle)" }}>
            <p style={{ fontSize: "calc(14px * var(--font-scale))", fontWeight: 600, color: "var(--text)", margin: "0 0 4px" }}>
              ✨ Living Decks (Pro)
            </p>
            <p style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-muted)", margin: "0 0 10px", lineHeight: 1.5 }}>
              {result.upsellMessage}
            </p>
            <a
              href={Routes.upgrade}
              style={{ color: "var(--primary)", fontWeight: 600, fontSize: "calc(13px * var(--font-scale))", textDecoration: "none" }}
            >
              Upgrade to Pro →
            </a>
          </div>
        )}

        {/* Stats row — concept #7b omits this for a perfect score, the big
            congrats art above already says everything. */}
        {!isPerfect && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 24,
            }}
          >
            <div
              style={{
                background: "rgba(77,107,45,0.08)",
                border: "1.5px solid var(--success)",
                borderRadius: 14,
                padding: "18px 20px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-display, serif)",
                  fontSize: "calc(32px * var(--font-scale))",
                  fontWeight: 700,
                  color: "var(--success)",
                  lineHeight: 1,
                  marginBottom: 4,
                }}
              >
                {result.correctCount}
              </div>
              <div style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--success-dark)", fontWeight: 600 }}>Correct ✓</div>
            </div>
            <div
              style={{
                background: missed.length > 0 ? "rgba(181,64,46,0.07)" : "var(--bg-card)",
                border: `1.5px solid ${missed.length > 0 ? "var(--error)" : "var(--border)"}`,
                borderRadius: 14,
                padding: "18px 20px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-display, serif)",
                  fontSize: "calc(32px * var(--font-scale))",
                  fontWeight: 700,
                  color: missed.length > 0 ? "var(--error)" : "var(--success)",
                  lineHeight: 1,
                  marginBottom: 4,
                }}
              >
                {missed.length}
              </div>
              <div style={{ fontSize: "calc(13px * var(--font-scale))", color: missed.length > 0 ? "var(--error-dark)" : "var(--text-muted)", fontWeight: 600 }}>
                Review again
              </div>
            </div>
          </div>
        )}

        {/* Missed cards */}
        {missed.length > 0 && (
          <div
            ref={missedRef}
            style={{
              background: "var(--bg-card)",
              border: "1.5px solid var(--border)",
              borderRadius: 16,
              overflow: "hidden",
              marginBottom: 28,
            }}
          >
            <button
              type="button"
              onClick={() => setShowMissed((v) => !v)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-body, sans-serif)",
              }}
            >
              <span style={{ fontSize: "calc(14px * var(--font-scale))", fontWeight: 600, color: "var(--text)" }}>
                📋 Review missed cards ({missed.length})
              </span>
              <span style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--text-muted)" }}>
                {showMissed ? "▲" : "▼"}
              </span>
            </button>

            {showMissed && (
              <div style={{ borderTop: "1px solid var(--border)" }}>
                {missed.map((a, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "18px 20px",
                      borderBottom: i < missed.length - 1 ? "1px solid var(--border)" : "none",
                    }}
                  >
                    <p
                      style={{
                        fontSize: "calc(14px * var(--font-scale))",
                        fontWeight: 700,
                        color: "var(--text)",
                        marginBottom: 12,
                        lineHeight: 1.45,
                      }}
                    >
                      {i + 1}. {a.front}
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ background: "var(--success-bg)", borderRadius: 10, padding: "8px 12px" }}>
                        <div style={{ fontSize: "calc(11px * var(--font-scale))", fontWeight: 700, letterSpacing: "0.04em", color: "var(--success-dark)", textTransform: "uppercase", marginBottom: 3 }}>
                          Correct answer
                        </div>
                        <div style={{ fontSize: "calc(13.5px * var(--font-scale))", color: "var(--success-dark)", lineHeight: 1.5 }}>
                          {a.back}
                        </div>
                      </div>
                      {a.userAnswer && (
                        <div style={{ background: "var(--error-bg)", borderRadius: 10, padding: "8px 12px" }}>
                          <div style={{ fontSize: "calc(11px * var(--font-scale))", fontWeight: 700, letterSpacing: "0.04em", color: "var(--error-dark)", textTransform: "uppercase", marginBottom: 3 }}>
                            Your answer
                          </div>
                          <div style={{ fontSize: "calc(13.5px * var(--font-scale))", color: "var(--error-dark)", lineHeight: 1.5 }}>
                            {a.userAnswer}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        {isPerfect ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "center" }}>
            <a href={Routes.deck(deckId)} style={secondaryBtnStyle}>
              ← Back to deck
            </a>
            <a href={Routes.dashboard} style={primaryBtnStyle}>
              Try a harder deck →
            </a>
            <button type="button" onClick={handleShareScore} disabled={shareStatus === "working"} style={secondaryBtnStyle}>
              📤 Share score
            </button>
            {shareStatus !== "idle" && shareStatus !== "working" && (
              <span style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-muted)" }}>
                {shareStatus === "shared" && "Shared!"}
                {shareStatus === "saved" && "Image saved — link copied!"}
                {shareStatus === "error" && "Couldn't share — try again."}
              </span>
            )}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "center" }}>
              <a href={Routes.deck(deckId)} style={secondaryBtnStyle}>
                ← Back to deck
              </a>
              {missed.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setShowMissed(true);
                    missedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  style={{ ...secondaryBtnStyle, borderColor: "var(--error)", color: "var(--error-dark)" }}
                >
                  Review {missed.length} wrong
                </button>
              )}
              <a href={Routes.quiz(deckId)} style={primaryBtnStyle}>
                Try again ↺
              </a>
              <button type="button" onClick={handleShareScore} disabled={shareStatus === "working"} style={secondaryBtnStyle}>
                📤 Share score
              </button>
              {shareStatus !== "idle" && shareStatus !== "working" && (
                <span style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-muted)" }}>
                  {shareStatus === "shared" && "Shared!"}
                  {shareStatus === "saved" && "Image saved — link copied!"}
                  {shareStatus === "error" && "Couldn't share — try again."}
                </span>
              )}
            </div>
            <div style={{ marginTop: 12, textAlign: "center" }}>
              <a href={Routes.dashboard} style={{ color: "var(--text-muted)", fontSize: "calc(13px * var(--font-scale))", textDecoration: "none" }}>
                Dashboard
              </a>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
