import { createSessionClient } from "@/lib/supabase/server";
import {
  TableNames,
  type QuizAnswer,
  type QuizSession,
  type QuizType,
  type SubmitQuizAnswer,
} from "@/lib/contracts";
import { toDbError } from "@/lib/db/errors";

/**
 * Quiz session + answer persistence through the session client.
 * quiz_sessions is RLS-scoped by user_id; quiz_answers resolves ownership via
 * its parent session (schema §5), so answers only need a valid session_id.
 */

export interface NewQuizSessionInput {
  deckId: string;
  userId: string;
  quizType: QuizType;
  totalQuestions: number;
}

/** Open a quiz session. Score/completed_at stay null until completeQuizSession. */
export async function createQuizSession(
  input: NewQuizSessionInput
): Promise<QuizSession> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from(TableNames.quizSessions)
    .insert({
      deck_id: input.deckId,
      user_id: input.userId,
      quiz_type: input.quizType,
      total_questions: input.totalQuestions,
    })
    .select("*")
    .single();
  if (error) throw toDbError(error, "Failed to start quiz.");
  return data as QuizSession;
}

/** Fetch a session by id (RLS: own sessions only). null if not found. */
export async function getQuizSessionById(
  sessionId: string
): Promise<QuizSession | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from(TableNames.quizSessions)
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw toDbError(error, "Failed to load quiz session.");
  return (data as QuizSession) ?? null;
}

/** Persist all answers for a session in one insert. */
export async function insertQuizAnswers(
  sessionId: string,
  answers: SubmitQuizAnswer[]
): Promise<QuizAnswer[]> {
  if (answers.length === 0) return [];

  const supabase = await createSessionClient();
  const rows = answers.map((a) => ({
    session_id: sessionId,
    flashcard_id: a.flashcardId,
    user_answer: a.userAnswer,
    is_correct: a.isCorrect,
  }));

  const { data, error } = await supabase
    .from(TableNames.quizAnswers)
    .insert(rows)
    .select("*");
  if (error) throw toDbError(error, "Failed to save quiz answers.");
  return (data as QuizAnswer[]) ?? [];
}

/** Finalise a session: store score, mark completed, and the Living Deck flag. */
export async function completeQuizSession(
  sessionId: string,
  result: {
    correctCount: number;
    scorePercent: number;
    livingDeckRefreshTriggered: boolean;
  }
): Promise<QuizSession> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from(TableNames.quizSessions)
    .update({
      correct_count: result.correctCount,
      score_percent: result.scorePercent,
      living_deck_refresh_triggered: result.livingDeckRefreshTriggered,
      completed_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .select("*")
    .single();
  if (error) throw toDbError(error, "Failed to finalise quiz.");
  return data as QuizSession;
}
