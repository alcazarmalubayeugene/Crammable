import { createSessionClient } from "@/lib/supabase/server";
import {
  ApiErrorCode,
  LivingDeck,
  TableNames,
  Validation,
  type Flashcard,
  type GeneratedCard,
} from "@/lib/contracts";
import { dbError, toDbError } from "@/lib/db/errors";
import { ensureMaxItems, ensureMaxLength } from "@/lib/db/validate";

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

  // Validate before touching the DB (fail fast; backstops route-level Zod).
  for (const card of cards) {
    ensureMaxLength(card.front, Validation.flashcard.frontMaxLength, "Card front");
    ensureMaxLength(card.back, Validation.flashcard.backMaxLength, "Card back");
    ensureMaxItems(card.tags, Validation.flashcard.maxTags, "Card tags");
    for (const tag of card.tags) {
      ensureMaxLength(tag, Validation.flashcard.tagMaxLength, "Tag");
    }
  }

  const supabase = await createSessionClient();
  const rows = cards.map((card) => ({
    deck_id:          deckId,
    user_id:          userId,
    front:            card.front,
    back:             card.back,
    tags:             card.tags,
    category:         card.category,
    is_reinforcement: isReinforcement,
  }));

  const { data, error } = await supabase
    .from(TableNames.flashcards)
    .insert(rows)
    .select("*");
  if (error) throw toDbError(error, "Failed to save flashcards.");
  return (data as Flashcard[]) ?? [];
}

/**
 * Insert Living Deck reinforcement cards and charge 1 credit, atomically, via
 * insert_reinforcement_cards_and_charge() (schema §4.14c). Mirrors
 * createDeckWithCardsAndCharge: if deduct_credit() raises INSUFFICIENT_CREDITS,
 * the inserted cards and card_count bump roll back too — so a failed charge
 * never leaves orphan reinforcement cards. Runs through the SESSION client
 * (the function self-guards p_user_id = auth.uid() and the deck's ownership).
 *
 * @throws {DbError} FORBIDDEN (404, deck not found/not owned) ·
 *   VALIDATION_ERROR (no cards) · INSUFFICIENT_CREDITS (402)
 */
export async function insertReinforcementCardsAndCharge(
  userId: string,
  deckId: string,
  cards: GeneratedCard[]
): Promise<{ insertedCount: number; creditsRemaining: number }> {
  if (cards.length === 0) {
    throw dbError(ApiErrorCode.VALIDATION_ERROR, "No reinforcement cards to insert.");
  }

  for (const card of cards) {
    ensureMaxLength(card.front, Validation.flashcard.frontMaxLength, "Card front");
    ensureMaxLength(card.back, Validation.flashcard.backMaxLength, "Card back");
    ensureMaxItems(card.tags, Validation.flashcard.maxTags, "Card tags");
    for (const tag of card.tags) {
      ensureMaxLength(tag, Validation.flashcard.tagMaxLength, "Tag");
    }
  }

  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("insert_reinforcement_cards_and_charge", {
    p_user_id: userId,
    p_deck_id: deckId,
    p_cards: cards.map((c) => ({
      front: c.front,
      back: c.back,
      tags: c.tags,
      category: c.category,
    })),
  });
  if (error) throw toDbError(error, "Failed to save reinforcement cards.");

  const row = Array.isArray(data) ? data[0] : data;
  return {
    insertedCount: Number(row?.inserted_count ?? 0),
    creditsRemaining: Number(row?.credits_remaining ?? 0),
  };
}

/**
 * Recompute and persist decks.card_count from the actual flashcards row count
 * (D1 manual card CRUD). A single-statement read-then-write through the
 * session client; decks RLS ("users crud own", FOR ALL) scopes the update to
 * the caller's own deck. Recomputing from source of truth (rather than +1/-1)
 * keeps this self-correcting even under concurrent edits.
 */
export async function recomputeDeckCardCount(deckId: string): Promise<number> {
  const supabase = await createSessionClient();
  const { count, error: countError } = await supabase
    .from(TableNames.flashcards)
    .select("id", { count: "exact", head: true })
    .eq("deck_id", deckId);
  if (countError) throw toDbError(countError, "Failed to update deck.");

  const { error: updateError } = await supabase
    .from(TableNames.decks)
    .update({ card_count: count ?? 0 })
    .eq("id", deckId);
  if (updateError) throw toDbError(updateError, "Failed to update deck.");

  return count ?? 0;
}

export interface NewFlashcardInput {
  front:     string;
  back:      string;
  tags?:     string[];
  category?: string;
}

/**
 * Insert a single user-authored card into a deck (D1) and resync card_count.
 * The deck's existence/ownership and tier card-cap are checked by the route
 * before calling this — RLS additionally scopes the insert to the caller.
 */
export async function createFlashcard(
  deckId: string,
  userId: string,
  input: NewFlashcardInput
): Promise<{ card: Flashcard; cardCount: number }> {
  const front = input.front.trim();
  const back = input.back.trim();
  const tags = input.tags ?? [];
  const category = (input.category ?? "").trim() || "General";

  if (!front) throw dbError(ApiErrorCode.VALIDATION_ERROR, "Card front is required.");
  if (!back) throw dbError(ApiErrorCode.VALIDATION_ERROR, "Card back is required.");
  ensureMaxLength(front, Validation.flashcard.frontMaxLength, "Card front");
  ensureMaxLength(back, Validation.flashcard.backMaxLength, "Card back");
  ensureMaxLength(category, Validation.flashcard.categoryMaxLength, "Category");
  ensureMaxItems(tags, Validation.flashcard.maxTags, "Card tags");
  for (const tag of tags) {
    ensureMaxLength(tag, Validation.flashcard.tagMaxLength, "Tag");
  }

  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from(TableNames.flashcards)
    .insert({
      deck_id:  deckId,
      user_id:  userId,
      front,
      back,
      tags,
      category,
    })
    .select("*")
    .single();
  if (error) throw toDbError(error, "Failed to create flashcard.");

  const cardCount = await recomputeDeckCardCount(deckId);
  return { card: data as Flashcard, cardCount };
}

export interface FlashcardEdits {
  front?:    string;
  back?:     string;
  tags?:     string[];
  category?: string;
}

/**
 * Edit a card's front/back/tags/category (D1). Plain session-client update —
 * flashcards RLS ("users crud own") scopes the write to the caller's card.
 * Returns null if the card doesn't exist or isn't owned by the caller.
 */
export async function updateFlashcard(cardId: string, edits: FlashcardEdits): Promise<Flashcard | null> {
  const payload: Record<string, string | string[]> = {};

  if (edits.front !== undefined) {
    const front = edits.front.trim();
    if (!front) throw dbError(ApiErrorCode.VALIDATION_ERROR, "Card front is required.");
    ensureMaxLength(front, Validation.flashcard.frontMaxLength, "Card front");
    payload.front = front;
  }
  if (edits.back !== undefined) {
    const back = edits.back.trim();
    if (!back) throw dbError(ApiErrorCode.VALIDATION_ERROR, "Card back is required.");
    ensureMaxLength(back, Validation.flashcard.backMaxLength, "Card back");
    payload.back = back;
  }
  if (edits.category !== undefined) {
    const category = edits.category.trim() || "General";
    ensureMaxLength(category, Validation.flashcard.categoryMaxLength, "Category");
    payload.category = category;
  }
  if (edits.tags !== undefined) {
    ensureMaxItems(edits.tags, Validation.flashcard.maxTags, "Card tags");
    for (const tag of edits.tags) {
      ensureMaxLength(tag, Validation.flashcard.tagMaxLength, "Tag");
    }
    payload.tags = edits.tags;
  }

  if (Object.keys(payload).length === 0) {
    throw dbError(ApiErrorCode.VALIDATION_ERROR, "No changes provided.");
  }

  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from(TableNames.flashcards)
    .update(payload)
    .eq("id", cardId)
    .select("*")
    .maybeSingle();
  if (error) throw toDbError(error, "Failed to update flashcard.");
  return (data as Flashcard) ?? null;
}

/**
 * Delete a single card (D1) and resync the parent deck's card_count.
 * Returns the deleted card's deck_id, or null if the card doesn't exist or
 * isn't owned by the caller (flashcards RLS scopes the delete).
 */
export async function deleteFlashcard(cardId: string): Promise<{ deckId: string; cardCount: number } | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from(TableNames.flashcards)
    .delete()
    .eq("id", cardId)
    .select("deck_id")
    .maybeSingle();
  if (error) throw toDbError(error, "Failed to delete flashcard.");
  if (!data) return null;

  const deckId = (data as { deck_id: string }).deck_id;
  const cardCount = await recomputeDeckCardCount(deckId);
  return { deckId, cardCount };
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
