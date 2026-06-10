"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { App, Routes } from "@/lib/contracts";
import { QUIZ_RESULT_KEY, type QuizResultData } from "@/app/quiz/[deckId]/page";

// ── helpers ───────────────────────────────────────────────────────────────────

function scoreLabel(pct: number): { emoji: string; label: string; color: string } {
  if (pct >= 90) return { emoji: "🏆", label: "Excellent!", color: "#5C7A35" };
  if (pct >= 75) return { emoji: "👏", label: "Great job!", color: "#C47A2E" };
  if (pct >= 60) return { emoji: "📚", label: "Keep studying!", color: "#C47A2E" };
  return { emoji: "💪", label: "Keep at it!", color: "#8A6E52" };
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
          background: "#FAF2E4",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          fontFamily: "var(--font-dm-sans, sans-serif)",
        }}
      >
        <span style={{ fontSize: 48 }}>🦫</span>
        <p style={{ color: "#8A6E52", fontSize: 15 }}>No quiz results found.</p>
        <a
          href={Routes.quiz(deckId)}
          style={{ color: "#C47A2E", textDecoration: "none", fontWeight: 600, fontSize: 14 }}
        >
          Take the quiz →
        </a>
      </main>
    );
  }

  const { emoji, label, color } = scoreLabel(result.scorePercent);
  const missed = result.answers.filter((a) => !a.isCorrect);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#FAF2E4",
        fontFamily: "var(--font-dm-sans, sans-serif)",
      }}
    >
      {/* ── NAVBAR ── */}
      <nav
        style={{
          background: "#2E1A0C",
          borderBottom: "1px solid #4A2512",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          style={{
            maxWidth: 1200,
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
              style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}
            >
              <span style={{ fontSize: 14, color: "#C49A6C" }}>← Back</span>
            </a>
            <span style={{ color: "#4A2512", margin: "0 8px" }}>|</span>
            <span style={{ fontSize: 24 }}>🦫</span>
            <span
              style={{
                fontFamily: "var(--font-lora, serif)",
                fontWeight: 700,
                fontSize: 18,
                color: "#FAF2E4",
              }}
            >
              {App.name}
            </span>
          </div>
          <span style={{ fontSize: 13, color: "#C49A6C" }}>Quiz Results</span>
        </div>
      </nav>

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 24px" }}>

        {/* Score card */}
        <div
          style={{
            background: "#FFFCF7",
            border: "1.5px solid #E0C9A8",
            borderRadius: 20,
            padding: "40px 32px",
            textAlign: "center",
            marginBottom: 24,
          }}
        >
          <div style={{ fontSize: 52, marginBottom: 8 }}>{emoji}</div>

          <div
            style={{
              fontFamily: "var(--font-lora, serif)",
              fontSize: 64,
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
              fontFamily: "var(--font-lora, serif)",
              fontSize: 18,
              fontWeight: 600,
              color: "#2E1A0C",
              marginBottom: 6,
            }}
          >
            {label}
          </p>

          <p style={{ fontSize: 14, color: "#8A6E52", marginBottom: 0 }}>
            {result.correctCount} correct out of {result.totalQuestions} questions
          </p>

          {result.deckTitle && (
            <p
              style={{
                fontSize: 13,
                color: "#C49A6C",
                marginTop: 8,
                fontStyle: "italic",
              }}
            >
              {result.deckTitle}
            </p>
          )}
        </div>

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
              background: "#FFFCF7",
              border: "1.5px solid #E0C9A8",
              borderRadius: 14,
              padding: "18px 20px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-lora, serif)",
                fontSize: 32,
                fontWeight: 700,
                color: "#5C7A35",
                lineHeight: 1,
                marginBottom: 4,
              }}
            >
              {result.correctCount}
            </div>
            <div style={{ fontSize: 13, color: "#8A6E52" }}>Correct</div>
          </div>
          <div
            style={{
              background: "#FFFCF7",
              border: "1.5px solid #E0C9A8",
              borderRadius: 14,
              padding: "18px 20px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-lora, serif)",
                fontSize: 32,
                fontWeight: 700,
                color: missed.length > 0 ? "#EF4444" : "#5C7A35",
                lineHeight: 1,
                marginBottom: 4,
              }}
            >
              {missed.length}
            </div>
            <div style={{ fontSize: 13, color: "#8A6E52" }}>Missed</div>
          </div>
        </div>

        {/* Missed cards */}
        {missed.length > 0 && (
          <div
            style={{
              background: "#FFFCF7",
              border: "1.5px solid #E0C9A8",
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
                fontFamily: "var(--font-dm-sans, sans-serif)",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: "#2E1A0C" }}>
                📋 Review missed cards ({missed.length})
              </span>
              <span style={{ fontSize: 14, color: "#8A6E52" }}>
                {showMissed ? "▲" : "▼"}
              </span>
            </button>

            {showMissed && (
              <div style={{ borderTop: "1px solid #E0C9A8" }}>
                {missed.map((a, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "16px 20px",
                      borderBottom: i < missed.length - 1 ? "1px solid #E0C9A8" : "none",
                    }}
                  >
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#2E1A0C",
                        marginBottom: 6,
                        lineHeight: 1.4,
                      }}
                    >
                      {a.front}
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span style={{ fontSize: 12, color: "#5C7A35", fontWeight: 600, minWidth: 60 }}>
                          Correct:
                        </span>
                        <span style={{ fontSize: 13, color: "#3A5020", lineHeight: 1.4 }}>
                          {a.back}
                        </span>
                      </div>
                      {a.userAnswer && (
                        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <span
                            style={{ fontSize: 12, color: "#EF4444", fontWeight: 600, minWidth: 60 }}
                          >
                            Yours:
                          </span>
                          <span style={{ fontSize: 13, color: "#991B1B", lineHeight: 1.4 }}>
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
              background: "#C47A2E",
              color: "#FAF2E4",
              padding: "12px 24px",
              borderRadius: 10,
              fontWeight: 600,
              fontSize: 14,
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
              background: "#FFFCF7",
              color: "#2E1A0C",
              border: "1.5px solid #E0C9A8",
              padding: "12px 24px",
              borderRadius: 10,
              fontWeight: 600,
              fontSize: 14,
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
              color: "#8A6E52",
              padding: "12px 24px",
              borderRadius: 10,
              fontSize: 14,
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
