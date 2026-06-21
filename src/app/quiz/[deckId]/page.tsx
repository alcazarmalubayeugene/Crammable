"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import {
  App,
  ApiPaths,
  QuizType,
  Routes,
  UIMessages,
  type Deck,
  type ExplainAnswerResult,
  type QuizQuestion,
  type SubmitQuizAnswer,
} from "@/lib/contracts";

// ── local types ───────────────────────────────────────────────────────────────

// Stored in sessionStorage so result/page.tsx can display the review.
export interface QuizResultData {
  deckId:         string;
  deckTitle:      string;
  scorePercent:   number;
  correctCount:   number;
  totalQuestions: number;
  livingDeckRefreshTriggered: boolean;
  reinforcedCardCount?: number;
  upsellMessage?: string;
  answers: Array<{
    front:      string;
    back:       string;
    userAnswer: string | null;
    isCorrect:  boolean;
  }>;
}

export const QUIZ_RESULT_KEY = "crammable_quiz_result";

// Tracks a single answered question locally until the session is submitted.
interface LocalAnswer {
  flashcardId: string;
  front:       string;
  back:        string;
  userAnswer:  string;
  isCorrect:   boolean;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function looselyCorrect(user: string, correct: string): boolean {
  return user.trim().toLowerCase() === correct.trim().toLowerCase();
}

// ── page ──────────────────────────────────────────────────────────────────────

type Phase = "loading" | "error" | "setup" | "starting" | "quizzing" | "submitting";

export default function QuizPage() {
  const params = useParams();
  const router = useRouter();
  const deckId = Array.isArray(params.deckId)
    ? params.deckId[0]
    : (params.deckId as string);

  // ── data ──
  const [deck, setDeck] = useState<Deck | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [loadError, setLoadError] = useState("");

  // ── setup ──
  const [selectedType, setSelectedType] = useState<QuizType>(QuizType.MULTIPLE_CHOICE);

  // ── in-quiz ──
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [hasAnswered, setHasAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [answers, setAnswers] = useState<LocalAnswer[]>([]);
  // Capy's "why" lesson, shown only on a wrong answer. Baked-in cards set it
  // instantly; older cards fall back to a live /api/quiz/explain call.
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explanationLoading, setExplanationLoading] = useState(false);

  // ── load deck via API ──────────────────────────────────────────────────────

  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoadError("Taking too long to load. Check your connection and refresh.");
      setPhase("error");
    }, 10_000);

    async function load() {
      try {
        const res = await fetch(ApiPaths.deck(deckId));
        const data = await res.json() as { success: boolean; deck?: Deck; error?: { message: string } };
        if (!data.success || !data.deck) {
          setLoadError(data.error?.message ?? "Deck not found.");
          setPhase("error");
          return;
        }
        setDeck(data.deck);
        setPhase("setup");
      } catch {
        setLoadError("Failed to load deck. Check your connection and try again.");
        setPhase("error");
      } finally {
        clearTimeout(timeout);
      }
    }

    load();
    return () => clearTimeout(timeout);
  }, [deckId]);

  // ── quiz actions ──────────────────────────────────────────────────────────

  async function startQuiz() {
    setPhase("starting");
    try {
      const res = await fetch(ApiPaths.startQuiz(deckId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizType: selectedType }),
      });
      const data = await res.json() as {
        success: boolean;
        sessionId?: string;
        questions?: QuizQuestion[];
        error?: { message: string };
      };

      if (!data.success || !data.sessionId || !data.questions) {
        setLoadError(data.error?.message ?? "Failed to start quiz.");
        setPhase("error");
        return;
      }

      setSessionId(data.sessionId);
      setQuestions(data.questions);
      setCurrentIdx(0);
      setAnswers([]);
      setSelectedOption(null);
      setTypedAnswer("");
      setHasAnswered(false);
      setIsCorrect(false);
      setExplanation(null);
      setExplanationLoading(false);
      setPhase("quizzing");
    } catch {
      setLoadError("Failed to start quiz. Check your connection and try again.");
      setPhase("error");
    }
  }

  // Live fallback for cards that predate the baked-in explanation. Best-effort:
  // a free bonus, so errors are swallowed and never block the student.
  async function fetchExplanation(questionText: string, correctAnswer: string) {
    setExplanationLoading(true);
    try {
      const res = await fetch(ApiPaths.explainAnswer, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionText, correctAnswer }),
      });
      const data = (await res.json()) as { success: boolean } & Partial<ExplainAnswerResult>;
      if (data.success && data.explanation) setExplanation(data.explanation);
    } catch {
      // silent — never something the student waits on or sees an error for
    } finally {
      setExplanationLoading(false);
    }
  }

  function submitAnswer() {
    const q = questions[currentIdx];
    if (!q) return;

    let userAnswer: string;
    let correct: boolean;

    if (q.quizType === QuizType.MULTIPLE_CHOICE) {
      if (!selectedOption) return;
      userAnswer = selectedOption;
      correct = userAnswer === q.correctAnswer;
    } else {
      if (!typedAnswer.trim()) return;
      userAnswer = typedAnswer;
      correct = looselyCorrect(userAnswer, q.correctAnswer);
    }

    setAnswers((prev) => [
      ...prev,
      {
        flashcardId: q.flashcardId,
        front:       q.questionText,
        back:        q.correctAnswer,
        userAnswer,
        isCorrect:   correct,
      },
    ]);
    setIsCorrect(correct);
    setHasAnswered(true);

    if (!correct) {
      if (q.correctExplanation) {
        setExplanation(q.correctExplanation);                 // instant, baked-in
      } else {
        void fetchExplanation(q.questionText, q.correctAnswer); // old card, live fallback
      }
    }
  }

  async function nextQuestion(currentAnswers: LocalAnswer[]) {
    const isLast = currentIdx === questions.length - 1;

    if (!isLast) {
      setCurrentIdx((i) => i + 1);
      setSelectedOption(null);
      setTypedAnswer("");
      setHasAnswered(false);
      setIsCorrect(false);
      setExplanation(null);
      setExplanationLoading(false);
      return;
    }

    // Last question — submit to the API.
    if (!sessionId) return;
    setPhase("submitting");

    const submitPayload: SubmitQuizAnswer[] = currentAnswers.map((a) => ({
      flashcardId: a.flashcardId,
      userAnswer:  a.userAnswer,
      isCorrect:   a.isCorrect,
    }));

    try {
      const res = await fetch(ApiPaths.submitQuizResult, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, answers: submitPayload }),
      });
      const data = await res.json() as {
        success: boolean;
        scorePercent?: number;
        correctCount?: number;
        totalQuestions?: number;
        livingDeckRefreshTriggered?: boolean;
        reinforcedCardCount?: number;
        upsellMessage?: string;
        error?: { message: string };
      };

      if (!data.success) {
        setLoadError(data.error?.message ?? "Failed to save quiz results.");
        setPhase("error");
        return;
      }

      const result: QuizResultData = {
        deckId,
        deckTitle:      deck?.title ?? "",
        scorePercent:   data.scorePercent ?? 0,
        correctCount:   data.correctCount ?? 0,
        totalQuestions: data.totalQuestions ?? currentAnswers.length,
        livingDeckRefreshTriggered: data.livingDeckRefreshTriggered ?? false,
        reinforcedCardCount: data.reinforcedCardCount,
        upsellMessage: data.upsellMessage,
        answers:        currentAnswers.map((a) => ({
          front:      a.front,
          back:       a.back,
          userAnswer: a.userAnswer,
          isCorrect:  a.isCorrect,
        })),
      };

      sessionStorage.setItem(QUIZ_RESULT_KEY, JSON.stringify(result));
      router.push(Routes.quizResult(deckId));
    } catch {
      setLoadError("Failed to save quiz results. Check your connection and try again.");
      setPhase("error");
    }
  }

  // ── derived ───────────────────────────────────────────────────────────────

  const q = questions[currentIdx] ?? null;
  const total = questions.length;
  const progressPct = total > 0 ? ((currentIdx + (hasAnswered ? 1 : 0)) / total) * 100 : 0;
  const canUseMC = (deck?.card_count ?? 0) >= 4;

  // ── loading / error ───────────────────────────────────────────────────────

  if (phase === "loading" || phase === "starting" || phase === "submitting") {
    const msg =
      phase === "starting"   ? "Setting up quiz…" :
      phase === "submitting" ? "Saving your results…" :
      "Loading…";
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "var(--bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-body, sans-serif)" }}>
          {msg}
        </p>
      </main>
    );
  }

  if (phase === "error") {
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
        <p style={{ color: "var(--text-muted)", fontSize: "calc(15px * var(--font-scale))" }}>{loadError}</p>
        <a
          href={Routes.dashboard}
          style={{ color: "var(--primary)", textDecoration: "none", fontWeight: 600, fontSize: "calc(14px * var(--font-scale))" }}
        >
          ← Back to Dashboard
        </a>
      </main>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────

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

          {phase === "quizzing" && (
            <span style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-faint)" }}>
              {currentIdx + 1} / {total}
            </span>
          )}
          {phase === "setup" && (
            <span style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-faint)" }}>
              {deck?.title}
            </span>
          )}
        </div>
      </nav>

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 24px" }}>

        {/* ── SETUP PHASE ── */}
        {phase === "setup" && (
          <>
            <div style={{ marginBottom: 32 }}>
              <h1
                style={{
                  fontFamily: "var(--font-display, serif)",
                  fontSize: "calc(26px * var(--font-scale))",
                  fontWeight: 700,
                  color: "var(--text)",
                  marginBottom: 6,
                }}
              >
                Quiz yourself
              </h1>
              <p style={{ color: "var(--text-muted)", fontSize: "calc(14px * var(--font-scale))" }}>
                {deck?.card_count ?? 0}{" "}
                {(deck?.card_count ?? 0) === 1 ? "card" : "cards"} · {deck?.title}
              </p>
            </div>

            {(deck?.card_count ?? 0) === 0 ? (
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1.5px dashed var(--border)",
                  borderRadius: 16,
                  padding: "48px 24px",
                  textAlign: "center",
                }}
              >
                <p style={{ color: "var(--text-muted)", fontSize: "calc(15px * var(--font-scale))", marginBottom: 16 }}>
                  This deck has no cards yet.
                </p>
                <a
                  href={Routes.deck(deckId)}
                  style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none", fontSize: "calc(14px * var(--font-scale))" }}
                >
                  ← Back to deck
                </a>
              </div>
            ) : (
              <>
                <p
                  style={{
                    fontSize: "calc(13px * var(--font-scale))",
                    fontWeight: 600,
                    color: "var(--text)",
                    marginBottom: 12,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Choose a quiz type
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
                  {(
                    [
                      {
                        type:         QuizType.MULTIPLE_CHOICE,
                        label:        "Multiple Choice",
                        icon:         "🔘",
                        desc:         "Pick the correct answer from 4 options.",
                        disabled:     !canUseMC,
                        disabledNote: "Need at least 4 cards",
                      },
                      {
                        type:         QuizType.IDENTIFICATION,
                        label:        "Identification",
                        icon:         "✏️",
                        desc:         "Type the answer yourself from memory.",
                        disabled:     false,
                        disabledNote: "",
                      },
                      {
                        type:         QuizType.MIXED,
                        label:        "Mixed",
                        icon:         "🎲",
                        desc:         "A random mix of both types.",
                        disabled:     false,
                        disabledNote: "",
                      },
                    ] as const
                  ).map(({ type, label, icon, desc, disabled, disabledNote }) => {
                    const active = selectedType === type && !disabled;
                    return (
                      <button
                        key={type}
                        type="button"
                        disabled={disabled}
                        onClick={() => !disabled && setSelectedType(type)}
                        style={{
                          display:    "flex",
                          alignItems: "flex-start",
                          gap:        14,
                          background: active ? "var(--nav-bg)" : "var(--bg-card)",
                          border:     active ? "1.5px solid var(--primary)" : "1.5px solid var(--border)",
                          borderRadius: 14,
                          padding:    "16px 20px",
                          cursor:     disabled ? "not-allowed" : "pointer",
                          opacity:    disabled ? 0.45 : 1,
                          textAlign:  "left",
                          width:      "100%",
                          fontFamily: "var(--font-body, sans-serif)",
                        }}
                      >
                        <span style={{ fontSize: "calc(20px * var(--font-scale))", lineHeight: 1.4 }}>{icon}</span>
                        <div>
                          <div
                            style={{
                              fontSize: "calc(15px * var(--font-scale))",
                              fontWeight:  600,
                              color:       active ? "var(--nav-text)" : "var(--text)",
                              marginBottom: 2,
                            }}
                          >
                            {label}
                          </div>
                          <div style={{ fontSize: "calc(13px * var(--font-scale))", color: active ? "var(--text-faint)" : "var(--text-muted)" }}>
                            {disabled ? disabledNote : desc}
                          </div>
                        </div>
                        {active && (
                          <span
                            style={{
                              marginLeft: "auto",
                              fontSize: "calc(16px * var(--font-scale))",
                              color: "var(--primary)",
                              alignSelf:  "center",
                            }}
                          >
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div style={{ textAlign: "center" }}>
                  <button
                    type="button"
                    onClick={startQuiz}
                    style={{
                      background: "var(--primary)",
                      color: "var(--nav-text)",
                      border:      "none",
                      borderRadius: 10,
                      padding:     "13px 40px",
                      fontSize: "calc(15px * var(--font-scale))",
                      fontWeight:  600,
                      cursor:      "pointer",
                      fontFamily:  "var(--font-body, sans-serif)",
                    }}
                  >
                    🎯 Start Quiz
                  </button>
                </div>

                <p style={{ marginTop: 20, fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", textAlign: "center", lineHeight: 1.6 }}>
                  {UIMessages.aiDisclaimer}
                </p>
              </>
            )}
          </>
        )}

        {/* ── QUIZZING PHASE ── */}
        {phase === "quizzing" && q && (
          <>
            {/* Progress bar */}
            <div
              style={{
                height:       4,
                background:   "var(--border)",
                borderRadius: 4,
                marginBottom: 28,
                overflow:     "hidden",
              }}
            >
              <div
                style={{
                  height:       "100%",
                  background: "var(--primary)",
                  borderRadius: 4,
                  width:        `${progressPct}%`,
                  transition:   "width 0.35s",
                }}
              />
            </div>

            {/* Question card */}
            <div
              style={{
                background: "var(--bg-card)",
                border: "1.5px solid var(--border)",
                borderRadius: 20,
                padding:      "32px",
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  fontSize: "calc(11px * var(--font-scale))",
                  fontWeight:    600,
                  letterSpacing: "0.08em",
                  color: "var(--text-faint)",
                  textTransform: "uppercase",
                  marginBottom:  14,
                }}
              >
                {q.quizType === QuizType.MULTIPLE_CHOICE ? "Multiple Choice" : "Identification"} ·
                Question {currentIdx + 1} of {total}
              </div>

              <p
                style={{
                  fontFamily:  "var(--font-display, serif)",
                  fontSize: "calc(20px * var(--font-scale))",
                  fontWeight:  600,
                  color: "var(--text)",
                  lineHeight:  1.5,
                  margin:      0,
                }}
              >
                {q.questionText}
              </p>
            </div>

            {/* Multiple choice options */}
            {q.quizType === QuizType.MULTIPLE_CHOICE && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                {(q.options ?? []).map((option) => {
                  const isSelected = selectedOption === option;
                  let bg     = "var(--bg-card)";
                  let border = "1.5px solid var(--border)";
                  let color  = "var(--text)";

                  if (hasAnswered) {
                    if (option === q.correctAnswer) {
                      bg = "var(--success-bg)"; border = "1.5px solid var(--success)"; color = "var(--success-dark)";
                    } else if (isSelected && !isCorrect) {
                      bg = "var(--error-bg)"; border = "1.5px solid var(--error)"; color = "var(--error-dark)";
                    }
                  } else if (isSelected) {
                    bg = "var(--nav-bg)"; border = "1.5px solid var(--primary)"; color = "var(--nav-text)";
                  }

                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={hasAnswered}
                      onClick={() => !hasAnswered && setSelectedOption(option)}
                      style={{
                        display:    "flex",
                        alignItems: "center",
                        gap:        12,
                        background: bg,
                        border,
                        borderRadius: 12,
                        padding:    "14px 18px",
                        cursor:     hasAnswered ? "default" : "pointer",
                        textAlign:  "left",
                        width:      "100%",
                        fontFamily: "var(--font-body, sans-serif)",
                        fontSize: "calc(14px * var(--font-scale))",
                        color,
                        fontWeight: isSelected ? 600 : 400,
                        transition: "all 0.15s",
                      }}
                    >
                      {hasAnswered && option === q.correctAnswer && (
                        <span style={{ fontSize: "calc(16px * var(--font-scale))" }}>✓</span>
                      )}
                      {hasAnswered && isSelected && !isCorrect && option !== q.correctAnswer && (
                        <span style={{ fontSize: "calc(16px * var(--font-scale))" }}>✗</span>
                      )}
                      {option}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Identification input */}
            {q.quizType === QuizType.IDENTIFICATION && (
              <div style={{ marginBottom: 20 }}>
                <textarea
                  value={typedAnswer}
                  onChange={(e) => !hasAnswered && setTypedAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !hasAnswered) {
                      e.preventDefault();
                      submitAnswer();
                    }
                  }}
                  rows={3}
                  disabled={hasAnswered}
                  placeholder="Type your answer here…"
                  style={{
                    width:       "100%",
                    boxSizing:   "border-box",
                    background:  hasAnswered ? "var(--bg-subtle)" : "var(--bg-card)",
                    border: "1.5px solid var(--border)",
                    borderRadius: 12,
                    padding:     "14px 16px",
                    fontSize: "calc(14px * var(--font-scale))",
                    color: "var(--text)",
                    fontFamily:  "var(--font-body, sans-serif)",
                    resize:      "vertical",
                    outline:     "none",
                    lineHeight:  1.5,
                  }}
                />

                {hasAnswered && (
                  <div
                    style={{
                      marginTop:    12,
                      background:   isCorrect ? "var(--success-bg)" : "var(--bg-card)",
                      border:       `1.5px solid ${isCorrect ? "var(--success)" : "var(--border)"}`,
                      borderRadius: 10,
                      padding:      "12px 16px",
                    }}
                  >
                    <p
                      style={{
                        fontSize: "calc(12px * var(--font-scale))",
                        fontWeight:    600,
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        margin:        "0 0 4px",
                      }}
                    >
                      Correct answer
                    </p>
                    <p
                      style={{
                        fontSize: "calc(14px * var(--font-scale))",
                        color: "var(--text)",
                        lineHeight: 1.5,
                        margin:     0,
                        fontFamily: "var(--font-display, serif)",
                      }}
                    >
                      {q.correctAnswer}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Feedback banner — the right/wrong call is already made by the option
                highlighting above; this banner stays neutral so it reads as Capy's
                tip, not a second red alarm stacked on top of the wrong-answer box. */}
            {hasAnswered && (
              <div
                style={{
                  background:   isCorrect ? "var(--success-bg)" : "var(--bg-subtle)",
                  border:       `1.5px solid ${isCorrect ? "var(--success)" : "var(--border)"}`,
                  borderRadius: 12,
                  padding:      "14px 18px",
                  marginBottom: 20,
                  display:      "flex",
                  alignItems:   "flex-start",
                  gap:          12,
                }}
              >
                {isCorrect ? (
                  <span style={{ fontSize: "calc(18px * var(--font-scale))" }}>✅</span>
                ) : (
                  <Image src="/capy/teaching-capy.png" alt="" width={48} height={48} style={{ borderRadius: "50%", flexShrink: 0, objectFit: "cover" }} />
                )}
                <div>
                  <p
                    style={{
                      fontSize: "calc(14px * var(--font-scale))",
                      fontWeight: 600,
                      color:      isCorrect ? "var(--success-dark)" : "var(--text-muted)",
                      margin:     0,
                    }}
                  >
                    {isCorrect ? "Correct!" : "Not quite — Capy's got you. Here's the right answer:"}
                  </p>
                  {!isCorrect && (explanation || explanationLoading) && (
                    <p
                      style={{
                        fontSize:  "calc(13px * var(--font-scale))",
                        color:     "var(--text-muted)",
                        lineHeight: 1.5,
                        margin:    "6px 0 0",
                        fontStyle: explanationLoading && !explanation ? "italic" : "normal",
                      }}
                    >
                      {explanation ?? "Capy is thinking…"}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              {!hasAnswered ? (
                <button
                  type="button"
                  onClick={submitAnswer}
                  disabled={
                    q.quizType === QuizType.MULTIPLE_CHOICE
                      ? !selectedOption
                      : !typedAnswer.trim()
                  }
                  style={{
                    background: "var(--primary)",
                    color: "var(--nav-text)",
                    border:      "none",
                    borderRadius: 10,
                    padding:     "12px 28px",
                    fontSize: "calc(14px * var(--font-scale))",
                    fontWeight:  600,
                    cursor:
                      (q.quizType === QuizType.MULTIPLE_CHOICE
                        ? !selectedOption
                        : !typedAnswer.trim())
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      (q.quizType === QuizType.MULTIPLE_CHOICE
                        ? !selectedOption
                        : !typedAnswer.trim())
                        ? 0.45
                        : 1,
                    fontFamily: "var(--font-body, sans-serif)",
                  }}
                >
                  Check Answer
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => nextQuestion(answers)}
                  style={{
                    background: "var(--primary)",
                    color: "var(--nav-text)",
                    border:      "none",
                    borderRadius: 10,
                    padding:     "12px 28px",
                    fontSize: "calc(14px * var(--font-scale))",
                    fontWeight:  600,
                    cursor:      "pointer",
                    fontFamily:  "var(--font-body, sans-serif)",
                  }}
                >
                  {currentIdx === total - 1 ? "Finish Quiz" : "Next →"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
