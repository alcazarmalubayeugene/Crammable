import { QuizType } from "@/lib/contracts";

// Per-deck quiz-type preference set on the deck page, read by the quiz page's
// setup screen as its pre-selected default (the user can still change it
// there before starting). localStorage, not sessionStorage — this is a
// lasting preference, not a transient mid-session pause state.
const KEY_PREFIX = "crammable_quiz_type_";

function typeKey(deckId: string): string {
  return KEY_PREFIX + deckId;
}

export function readDefaultQuizType(deckId: string): QuizType | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(typeKey(deckId));
  return raw === QuizType.MULTIPLE_CHOICE || raw === QuizType.IDENTIFICATION || raw === QuizType.MIXED
    ? raw
    : null;
}

export function saveDefaultQuizType(deckId: string, type: QuizType): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(typeKey(deckId), type);
}
