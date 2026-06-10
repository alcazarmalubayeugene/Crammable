"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  App,
  ApiPaths,
  QuizType,
  Routes,
  UIMessages,
  type Deck,
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
      setPhase("quizzing");
    } catch {
      setLoadError("Failed to start quiz. Check your connection and try again.");
      setPhase("error");
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
  }

  async function nextQuestion(currentAnswers: LocalAnswer[]) {
    const isLast = currentIdx === questions.length - 1;

    if (!isLast) {
      setCurrentIdx((i) => i + 1);
      setSelectedOption(null);
      setTypedAnswer("");
      setHasAnswered(false);
      setIsCorrect(false);
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
          background: "#FAF2E4",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ color: "#8A6E52", fontFamily: "var(--font-dm-sans, sans-serif)" }}>
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
          background: "#FAF2E4",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          fontFamily: "var(--font-dm-sans, sans-serif)",
        }}
      >
        <p style={{ color: "#8A6E52", fontSize: 15 }}>{loadError}</p>
        <a
          href={Routes.dashboard}
          style={{ color: "#C47A2E", textDecoration: "none", fontWeight: 600, fontSize: 14 }}
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

          {phase === "quizzing" && (
            <span style={{ fontSize: 13, color: "#C49A6C" }}>
              {currentIdx + 1} / {total}
            </span>
          )}
          {phase === "setup" && (
            <span style={{ fontSize: 13, color: "#C49A6C" }}>
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
                  fontFamily: "var(--font-lora, serif)",
                  fontSize: 26,
                  fontWeight: 700,
                  color: "#2E1A0C",
                  marginBottom: 6,
                }}
              >
                Quiz yourself
              </h1>
              <p style={{ color: "#8A6E52", fontSize: 14 }}>
                {deck?.card_count ?? 0}{" "}
                {(deck?.card_count ?? 0) === 1 ? "card" : "cards"} · {deck?.title}
              </p>
            </div>

            {(deck?.card_count ?? 0) === 0 ? (
              <div
                style={{
                  background: "#FFFCF7",
                  border: "1.5px dashed #E0C9A8",
                  borderRadius: 16,
                  padding: "48px 24px",
                  textAlign: "center",
                }}
              >
                <p style={{ color: "#8A6E52", fontSize: 15, marginBottom: 16 }}>
                  This deck has no cards yet.
                </p>
                <a
                  href={Routes.deck(deckId)}
                  style={{ color: "#C47A2E", fontWeight: 600, textDecoration: "none", fontSize: 14 }}
                >
                  ← Back to deck
                </a>
              </div>
            ) : (
              <>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#2E1A0C",
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
                          background: active ? "#4A2512" : "#FFFCF7",
                          border:     active ? "1.5px solid #C47A2E" : "1.5px solid #E0C9A8",
                          borderRadius: 14,
                          padding:    "16px 20px",
                          cursor:     disabled ? "not-allowed" : "pointer",
                          opacity:    disabled ? 0.45 : 1,
                          textAlign:  "left",
                          width:      "100%",
                          fontFamily: "var(--font-dm-sans, sans-serif)",
                        }}
                      >
                        <span style={{ fontSize: 20, lineHeight: 1.4 }}>{icon}</span>
                        <div>
                          <div
                            style={{
                              fontSize:    15,
                              fontWeight:  600,
                              color:       active ? "#FAF2E4" : "#2E1A0C",
                              marginBottom: 2,
                            }}
                          >
                            {label}
                          </div>
                          <div style={{ fontSize: 13, color: active ? "#C49A6C" : "#8A6E52" }}>
                            {disabled ? disabledNote : desc}
                          </div>
                        </div>
                        {active && (
                          <span
                            style={{
                              marginLeft: "auto",
                              fontSize:   16,
                              color:      "#C47A2E",
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
                      background:  "#C47A2E",
                      color:       "#FAF2E4",
                      border:      "none",
                      borderRadius: 10,
                      padding:     "13px 40px",
                      fontSize:    15,
                      fontWeight:  600,
                      cursor:      "pointer",
                      fontFamily:  "var(--font-dm-sans, sans-serif)",
                    }}
                  >
                    🎯 Start Quiz
                  </button>
                </div>

                <p style={{ marginTop: 20, fontSize: 12, color: "#8A6E52", textAlign: "center", lineHeight: 1.6 }}>
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
                background:   "#E0C9A8",
                borderRadius: 4,
                marginBottom: 28,
                overflow:     "hidden",
              }}
            >
              <div
                style={{
                  height:       "100%",
                  background:   "#C47A2E",
                  borderRadius: 4,
                  width:        `${progressPct}%`,
                  transition:   "width 0.35s",
                }}
              />
            </div>

            {/* Question card */}
            <div
              style={{
                background:   "#FFFCF7",
                border:       "1.5px solid #E0C9A8",
                borderRadius: 20,
                padding:      "32px",
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  fontSize:      11,
                  fontWeight:    600,
                  letterSpacing: "0.08em",
                  color:         "#C49A6C",
                  textTransform: "uppercase",
                  marginBottom:  14,
                }}
              >
                {q.quizType === QuizType.MULTIPLE_CHOICE ? "Multiple Choice" : "Identification"} ·
                Question {currentIdx + 1} of {total}
              </div>

              <p
                style={{
                  fontFamily:  "var(--font-lora, serif)",
                  fontSize:    20,
                  fontWeight:  600,
                  color:       "#2E1A0C",
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
                  let bg     = "#FFFCF7";
                  let border = "1.5px solid #E0C9A8";
                  let color  = "#2E1A0C";

                  if (hasAnswered) {
                    if (option === q.correctAnswer) {
                      bg = "#EDF5E4"; border = "1.5px solid #5C7A35"; color = "#3A5020";
                    } else if (isSelected && !isCorrect) {
                      bg = "#FEF2F2"; border = "1.5px solid #EF4444"; color = "#991B1B";
                    }
                  } else if (isSelected) {
                    bg = "#4A2512"; border = "1.5px solid #C47A2E"; color = "#FAF2E4";
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
                        fontFamily: "var(--font-dm-sans, sans-serif)",
                        fontSize:   14,
                        color,
                        fontWeight: isSelected ? 600 : 400,
                        transition: "all 0.15s",
                      }}
                    >
                      {hasAnswered && option === q.correctAnswer && (
                        <span style={{ fontSize: 16 }}>✓</span>
                      )}
                      {hasAnswered && isSelected && !isCorrect && option !== q.correctAnswer && (
                        <span style={{ fontSize: 16 }}>✗</span>
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
                    background:  hasAnswered ? "#F5F0EA" : "#FFFCF7",
                    border:      "1.5px solid #E0C9A8",
                    borderRadius: 12,
                    padding:     "14px 16px",
                    fontSize:    14,
                    color:       "#2E1A0C",
                    fontFamily:  "var(--font-dm-sans, sans-serif)",
                    resize:      "vertical",
                    outline:     "none",
                    lineHeight:  1.5,
                  }}
                />

                {hasAnswered && (
                  <div
                    style={{
                      marginTop:    12,
                      background:   isCorrect ? "#EDF5E4" : "#FFFCF7",
                      border:       `1.5px solid ${isCorrect ? "#5C7A35" : "#E0C9A8"}`,
                      borderRadius: 10,
                      padding:      "12px 16px",
                    }}
                  >
                    <p
                      style={{
                        fontSize:      12,
                        fontWeight:    600,
                        color:         "#8A6E52",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        margin:        "0 0 4px",
                      }}
                    >
                      Correct answer
                    </p>
                    <p
                      style={{
                        fontSize:   14,
                        color:      "#2E1A0C",
                        lineHeight: 1.5,
                        margin:     0,
                        fontFamily: "var(--font-lora, serif)",
                      }}
                    >
                      {q.correctAnswer}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Feedback banner */}
            {hasAnswered && (
              <div
                style={{
                  background:   isCorrect ? "#EDF5E4" : "#FEF2F2",
                  border:       `1.5px solid ${isCorrect ? "#5C7A35" : "#EF4444"}`,
                  borderRadius: 12,
                  padding:      "14px 18px",
                  marginBottom: 20,
                  display:      "flex",
                  alignItems:   "center",
                  gap:          10,
                }}
              >
                <span style={{ fontSize: 18 }}>{isCorrect ? "✅" : "❌"}</span>
                <p
                  style={{
                    fontSize:   14,
                    fontWeight: 600,
                    color:      isCorrect ? "#3A5020" : "#991B1B",
                    margin:     0,
                  }}
                >
                  {isCorrect ? "Correct!" : "Not quite."}
                </p>
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
                    background:  "#C47A2E",
                    color:       "#FAF2E4",
                    border:      "none",
                    borderRadius: 10,
                    padding:     "12px 28px",
                    fontSize:    14,
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
                    fontFamily: "var(--font-dm-sans, sans-serif)",
                  }}
                >
                  Check Answer
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => nextQuestion(answers)}
                  style={{
                    background:  "#C47A2E",
                    color:       "#FAF2E4",
                    border:      "none",
                    borderRadius: 10,
                    padding:     "12px 28px",
                    fontSize:    14,
                    fontWeight:  600,
                    cursor:      "pointer",
                    fontFamily:  "var(--font-dm-sans, sans-serif)",
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
