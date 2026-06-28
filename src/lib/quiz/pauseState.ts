import type { QuizQuestion, QuizType } from "@/lib/contracts";

// Shared shape for a quiz "paused" mid-session — sessionStorage only, keyed
// per deck so pausing deck A never collides with a fresh attempt at deck B.
// Used by both the quiz page (save/restore) and the dashboard (read-only, to
// show a "Continue — Question X of Y" indicator instead of "Quiz me").
export interface PausedQuizState {
  sessionId:  string;
  questions:  QuizQuestion[];
  currentIdx: number;
  answers: Array<{
    flashcardId: string;
    front:       string;
    back:        string;
    userAnswer:  string;
    isCorrect:   boolean;
    quizType:    "multiple_choice" | "identification";
  }>;
  quizType: QuizType;
}

const PAUSE_KEY_PREFIX = "crammable_quiz_pause_";

function pauseKey(deckId: string): string {
  return PAUSE_KEY_PREFIX + deckId;
}

export function readPausedQuiz(deckId: string): PausedQuizState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(pauseKey(deckId));
    return raw ? (JSON.parse(raw) as PausedQuizState) : null;
  } catch {
    return null;
  }
}

export function savePausedQuiz(deckId: string, state: PausedQuizState): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(pauseKey(deckId), JSON.stringify(state));
  } catch {
    // sessionStorage full/unavailable — worst case, resume just won't work
  }
}

export function clearPausedQuiz(deckId: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(pauseKey(deckId));
}
