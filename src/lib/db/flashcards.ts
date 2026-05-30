import { createSessionClient } from "@/lib/supabase/server";
import {
  LivingDeck,
  TableNames,
  type Flashcard,
  type GeneratedCard,
} from "@/lib/contracts";
import { toDbError } from "@/lib/db/errors";

/**
 * Flashcard reads/writes through the session client. user_id is denormalised on
 * the row (schema §1.3) so RLS — auth.uid() = user_id — applies without a join
 * back to decks.
 */

/**
 * Bulk-insert generated cards into a deck. user_id must be the deck owner so the
 * RLS WITH CHECK passes. Returns the inserted rows (with ids + defaults).
 *
 * `isReinforcement` marks Living Deck refresh cards; defaults to false for the
 * original generation pass.
 */
export async function insertFlashcards(
  deckId: string,
  userId: string,
  cards: GeneratedCard[],
  isReinforcement: boolean = false
): Promise<Flashcard[]> {
  if (cards.length === 0) return [];

  const supabase = await createSessionClient();
  const rows = cards.map((card) => ({
    deck_id: deckId,
    user_id: userId,
    front: card.front,
    back: card.back,
    tags: card.tags,
    is_reinforcement: isReinforcement,
  }));

  const { data, error } = await supabase
    .from(TableNames.flashcards)
    .insert(rows)
    .select("*");
  if (error) throw toDbError(error, "Failed to save flashcards.");
  return (data as Flashcard[]) ?? [];
}

/** Every card in a deck (deck viewer / quiz question source). */
export async function getFlashcardsForDeck(deckId: string): Promise<Flashcard[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from(TableNames.flashcards)
    .select("*")
    .eq("deck_id", deckId)
    .order("created_at", { ascending: true });
  if (error) throw toDbError(error, "Failed to load flashcards.");
  return (data as Flashcard[]) ?? [];
}

/**
 * The deck's weakest original cards, for a Living Deck refresh. Pulls
 * non-reinforcement cards at or above LivingDeck.weakCardThreshold, hardest
 * first, capped at LivingDeck.maxWeakCardsPerRefresh. Uses the partial index
 * idx_flashcards_difficulty.
 */
export async function getWeakCardsForDeck(deckId: string): Promise<Flashcard[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from(TableNames.flashcards)
    .select("*")
    .eq("deck_id", deckId)
    .eq("is_reinforcement", false)
    .gte("difficulty_score", LivingDeck.weakCardThreshold)
    .order("difficulty_score", { ascending: false })
    .limit(LivingDeck.maxWeakCardsPerRefresh);
  if (error) throw toDbError(error, "Failed to load weak cards.");
  return (data as Flashcard[]) ?? [];
}

/**
 * Record the outcome of reviewing a card in a quiz: increment the seen/correct
 * counters, stamp last_reviewed_at, and store the recomputed difficulty_score
 * (0–1; the quiz scoring logic computes the new value).
 *
 * Delegates to the apply_card_review() function (schema §4.12) so the counter
 * increment is a single atomic statement — a read-modify-write here would lose
 * updates under concurrent reviews and corrupt difficulty_score (which drives
 * Living Deck selection). Runs through the session client: that function is
 * SECURITY INVOKER, so flashcards RLS still restricts the write to the caller's
 * own card even though it's addressed by id.
 */
export async function applyCardReview(
  cardId: string,
  wasCorrect: boolean,
  newDifficultyScore: number
): Promise<void> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("apply_card_review", {
    p_card_id: cardId,
    p_was_correct: wasCorrect,
    p_difficulty: newDifficultyScore,
  });
  if (error) throw toDbError(error, "Failed to update card review stats.");
}
