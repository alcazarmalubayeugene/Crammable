import { createSessionClient } from "@/lib/supabase/server";
import {
  TableNames,
  type QuizSession,
  type QuizType,
  type SubmitQuizAnswer,
} from "@/lib/contracts";
import { toDbError } from "@/lib/db/errors";

/**
 * Quiz session reads/writes through the session client.
 * quiz_sessions is RLS-scoped by user_id; quiz_answers resolves ownership via
 * its parent session (schema §5). Finalising a quiz (answers + card stats +
 * completion) goes through the atomic submitQuizResult() RPC below, not separate
 * inserts/updates.
 */

export interface NewQuizSessionInput {
  deckId: string;
  userId: string;
  quizType: QuizType;
  totalQuestions: number;
}

/** Open a quiz session. Score/completed_at stay null until submitQuizResult. */
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

/**
 * Atomically + idempotently finalise a quiz via the submit_quiz_result() RPC
 * (schema §4.13). In one transaction it locks the session, re-checks
 * completed_at, inserts every answer, updates each reviewed card's stats, and
 * marks the session complete — so a double-submit can't double-apply card
 * reviews (which would corrupt times_seen / difficulty_score). Runs through the
 * SESSION client: the function is SECURITY INVOKER, so RLS confines every write
 * to the caller's own rows.
 *
 * @throws {DbError} FORBIDDEN (404) when the session is missing or not owned;
 *   VALIDATION_ERROR (409) when it was already submitted.
 */
export async function submitQuizResult(
  sessionId: string,
  answers: SubmitQuizAnswer[]
): Promise<{ correctCount: number; totalQuestions: number; scorePercent: number }> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("submit_quiz_result", {
    p_session_id: sessionId,
    p_answers: answers.map((a) => ({
      flashcardId: a.flashcardId,
      userAnswer: a.userAnswer,
      isCorrect: a.isCorrect,
    })),
  });
  if (error) throw toDbError(error, "Failed to submit quiz.");

  // submit_quiz_result RETURNS TABLE(...) → PostgREST yields an array of rows.
  const row = Array.isArray(data) ? data[0] : data;
  return {
    correctCount: Number(row?.correct_count ?? 0),
    totalQuestions: Number(row?.total_questions ?? 0),
    scorePercent: Number(row?.score_percent ?? 0),
  };
}

/** Fetch a quiz session by id (RLS-scoped to its owner). Returns null if not found. */
export async function getQuizSession(sessionId: string): Promise<QuizSession | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from(TableNames.quizSessions)
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw toDbError(error, "Failed to load quiz session.");
  return (data as QuizSession | null) ?? null;
}

/**
 * Stamp a quiz session as having triggered a Living Deck refresh. Plain
 * session-client update — quiz_sessions RLS already permits an owner to
 * update their own row (auth.uid() = user_id).
 */
export async function markLivingDeckRefreshTriggered(sessionId: string): Promise<void> {
  const supabase = await createSessionClient();
  const { error } = await supabase
    .from(TableNames.quizSessions)
    .update({ living_deck_refresh_triggered: true })
    .eq("id", sessionId);
  if (error) throw toDbError(error, "Failed to update quiz session.");
}
