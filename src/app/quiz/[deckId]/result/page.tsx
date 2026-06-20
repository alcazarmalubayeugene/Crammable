"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { App, Routes } from "@/lib/contracts";
import { QUIZ_RESULT_KEY, type QuizResultData } from "@/app/quiz/[deckId]/page";

// ── shared styles ─────────────────────────────────────────────────────────────

const cardStyle = {
  background: "var(--bg-card)",
  border: "1.5px solid var(--border)",
  borderRadius: 16,
  padding: "18px 20px",
  marginBottom: 24,
} as const;

// ── helpers ───────────────────────────────────────────────────────────────────

function scoreLabel(pct: number): { emoji: string; label: string; color: string; image?: string } {
  if (pct === 100) return { emoji: "🎉", label: "Perfect score!", color: "var(--success)", image: "/capy/congrats-capy.png" };
  if (pct >= 90) return { emoji: "🏆", label: "Excellent!", color: "var(--success)" };
  if (pct >= 75) return { emoji: "👏", label: "Great job!", color: "var(--primary)" };
  if (pct >= 60) return { emoji: "📚", label: "Keep studying!", color: "var(--primary)" };
  return { emoji: "💪", label: "Keep at it!", color: "var(--text-muted)" };
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
        <img src="/capy/capy-idle.svg" alt="" width={59} height={48} style={{ height: "calc(48px * var(--font-scale))", width: "auto" }} />
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

  const { emoji, label, color, image } = scoreLabel(result.scorePercent);
  const missed = result.answers.filter((a) => !a.isCorrect);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        fontFamily: "var(--font-body, sans-serif)",
      }}
    >
      {/* ── NAVBAR ── */}
      <nav
        style={{
          background: "var(--nav-bg)",
          borderBottom: "1px solid var(--nav-border)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          style={{
            maxWidth: "100%",
            margin: "0 auto",
            padding: "0 24px",
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <a
              href={Routes.deck(deckId)}
              className="nav-link"
              style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}
            >
              <span style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--text-faint)" }}>← Back</span>
            </a>
            <span style={{ color: "var(--nav-border)", margin: "0 8px" }}>|</span>
            <img src="/capy/capy-idle.svg" alt="" width={29} height={24} style={{ height: "calc(24px * var(--font-scale))", width: "auto" }} />
            <span
              style={{
                fontFamily: "var(--font-display, serif)",
                fontWeight: 700,
                fontSize: "calc(18px * var(--font-scale))",
                color: "var(--nav-text)",
              }}
            >
              {App.name}
            </span>
          </div>
          <span style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--primary)", fontWeight: 700 }}>Quiz Results</span>
        </div>
      </nav>

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
          {image ? (
            <Image
              src={image}
              alt=""
              width={96}
              height={96}
              style={{ borderRadius: "50%", margin: "0 auto 8px", display: "block", objectFit: "cover" }}
            />
          ) : (
            <div style={{ fontSize: "calc(52px * var(--font-scale))", marginBottom: 8 }}>{emoji}</div>
          )}

          <div
            style={{
              fontFamily: "var(--font-display, serif)",
              fontSize: "calc(64px * var(--font-scale))",
              fontWeight: 700,
              color,
              lineHeight: 1,
              marginBottom: 4,
            }}
          >
            {result.scorePercent}%
          </div>

          <p
            style={{
              fontFamily: "var(--font-display, serif)",
              fontSize: "calc(18px * var(--font-scale))",
              fontWeight: 600,
              color: "var(--text)",
              marginBottom: 6,
            }}
          >
            {label}
          </p>

          <p style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--text-muted)", marginBottom: 0 }}>
            {result.correctCount} correct out of {result.totalQuestions} questions
          </p>

          {result.deckTitle && (
            <p
              style={{
                fontSize: "calc(13px * var(--font-scale))",
                color: "var(--text-faint)",
                marginTop: 8,
                fontStyle: "italic",
              }}
            >
              {result.deckTitle}
            </p>
          )}
        </div>

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

        {/* Stats row */}
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
              background: "var(--bg-card)",
              border: "1.5px solid var(--border)",
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
            <div style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-muted)" }}>Correct</div>
          </div>
          <div
            style={{
              background: "var(--bg-card)",
              border: "1.5px solid var(--border)",
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
            <div style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-muted)" }}>Missed</div>
          </div>
        </div>

        {/* Missed cards */}
        {missed.length > 0 && (
          <div
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
                      padding: "16px 20px",
                      borderBottom: i < missed.length - 1 ? "1px solid var(--border)" : "none",
                    }}
                  >
                    <p
                      style={{
                        fontSize: "calc(13px * var(--font-scale))",
                        fontWeight: 600,
                        color: "var(--text)",
                        marginBottom: 6,
                        lineHeight: 1.4,
                      }}
                    >
                      {a.front}
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--success)", fontWeight: 600, minWidth: 60 }}>
                          Correct:
                        </span>
                        <span style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--success-dark)", lineHeight: 1.4 }}>
                          {a.back}
                        </span>
                      </div>
                      {a.userAnswer && (
                        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <span
                            style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--error)", fontWeight: 600, minWidth: 60 }}
                          >
                            Yours:
                          </span>
                          <span style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--error-dark)", lineHeight: 1.4 }}>
                            {a.userAnswer}
                          </span>
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
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a
            href={Routes.quiz(deckId)}
            style={{
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
            }}
          >
            🔁 Try Again
          </a>
          <a
            href={Routes.deck(deckId)}
            style={{
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
            }}
          >
            📚 Back to Deck
          </a>
          <a
            href={Routes.dashboard}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              color: "var(--text-muted)",
              padding: "12px 24px",
              borderRadius: 10,
              fontSize: "calc(14px * var(--font-scale))",
              textDecoration: "none",
            }}
          >
            Dashboard
          </a>
        </div>
      </div>
    </main>
  );
}
