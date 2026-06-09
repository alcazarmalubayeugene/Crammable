import { createSessionClient } from "@/lib/supabase/server";
import {
  ApiErrorCode,
  TableNames,
  Validation,
  type Deck,
  type Flashcard,
  type GeneratedCard,
  type GenerationMode,
  type PdfType,
} from "@/lib/contracts";
import { dbError, toDbError } from "@/lib/db/errors";
import { ensureMaxItems, ensureMaxLength } from "@/lib/db/validate";

/**
 * Deck CRUD through the session client — RLS scopes every query to the caller's
 * own rows. We still pass user_id explicitly on reads/writes for clarity and to
 * hit the (user_id, created_at) index.
 */

export interface NewDeckInput {
  userId: string;
  title: string;
  sourceFilename?: string | null;
  generationMode?: GenerationMode;
  pdfType: PdfType;
}

/** Insert a deck row. card_count starts at 0 and is set after cards persist. */
export async function createDeck(input: NewDeckInput): Promise<Deck> {
  ensureMaxLength(input.title, Validation.deck.titleMaxLength, "Deck title");
  ensureMaxLength(input.sourceFilename, Validation.deck.filenameMaxLength, "Filename");

  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from(TableNames.decks)
    .insert({
      user_id: input.userId,
      title: input.title,
      source_filename: input.sourceFilename ?? null,
      generation_mode: input.generationMode,
      pdf_type: input.pdfType,
    })
    .select("*")
    .single();
  if (error) throw toDbError(error, "Failed to create deck.");
  return data as Deck;
}

/** All of a user's decks, newest first (dashboard list). */
export async function listDecksForUser(userId: string): Promise<Deck[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from(TableNames.decks)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw toDbError(error, "Failed to load decks.");
  return (data as Deck[]) ?? [];
}

/** Single deck by id (RLS guarantees ownership). null if not found. */
export async function getDeckById(deckId: string): Promise<Deck | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from(TableNames.decks)
    .select("*")
    .eq("id", deckId)
    .maybeSingle();
  if (error) throw toDbError(error, "Failed to load deck.");
  return (data as Deck) ?? null;
}

/** Deck + its flashcards for the deck viewer. null when the deck doesn't exist. */
export async function getDeckWithCards(
  deckId: string
): Promise<{ deck: Deck; cards: Flashcard[] } | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from(TableNames.decks)
    .select(`*, ${TableNames.flashcards}(*)`)
    .eq("id", deckId)
    .maybeSingle();
  if (error) throw toDbError(error, "Failed to load deck.");
  if (!data) return null;

  // Strip the embedded array off the deck row so `deck` matches the Deck shape.
  const { [TableNames.flashcards]: cards, ...deck } = data as Deck &
    Record<typeof TableNames.flashcards, Flashcard[]>;
  return { deck: deck as Deck, cards: (cards as Flashcard[]) ?? [] };
}

/** Count a user's decks — used to enforce TierLimits.maxDecks. */
export async function countDecksForUser(userId: string): Promise<number> {
  const supabase = await createSessionClient();
  const { count, error } = await supabase
    .from(TableNames.decks)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw toDbError(error, "Failed to count decks.");
  return count ?? 0;
}

/** Keep the cached card_count in sync after generation or a Living Deck refresh. */
export async function updateDeckCardCount(
  deckId: string,
  cardCount: number
): Promise<void> {
  const supabase = await createSessionClient();
  const { error } = await supabase
    .from(TableNames.decks)
    .update({ card_count: cardCount })
    .eq("id", deckId);
  if (error) throw toDbError(error, "Failed to update deck card count.");
}

/**
 * Delete a deck (flashcards/quiz rows cascade via FK). Returns the number of
 * rows deleted — 0 when the deck doesn't exist or isn't owned by the caller
 * (RLS scopes the delete), so callers can map 0 to a 404 without a pre-check.
 */
export async function deleteDeck(deckId: string): Promise<number> {
  const supabase = await createSessionClient();
  const { error, count } = await supabase
    .from(TableNames.decks)
    .delete({ count: "exact" })
    .eq("id", deckId);
  if (error) throw toDbError(error, "Failed to delete deck.");
  return count ?? 0;
}

/**
 * Persist a generated deck + its cards AND charge one credit, atomically, via
 * the create_deck_with_cards_and_charge() RPC (schema §4.14). The deck insert,
 * card inserts, card_count sync and deduct_credit() all commit in a single
 * transaction: INSUFFICIENT_CREDITS (or any failure) rolls the whole thing back,
 * so a persisted deck is always paid for and a failed charge never leaves an
 * orphan deck. Replaces the old deduct-last + compensating-delete pattern.
 *
 * Validation mirrors the previous createDeck/insertFlashcards path (fail fast
 * before the DB call). The RPC is SECURITY DEFINER but self-guarded to
 * auth.uid(), so it's called through the SESSION client — never service-role.
 *
 * @throws {DbError} INSUFFICIENT_CREDITS (402) when the balance is already 0.
 */
export async function createDeckWithCardsAndCharge(
  deckInput: NewDeckInput,
  cards: GeneratedCard[]
): Promise<{ deckId: string; creditsRemaining: number }> {
  ensureMaxLength(deckInput.title, Validation.deck.titleMaxLength, "Deck title");
  ensureMaxLength(deckInput.sourceFilename, Validation.deck.filenameMaxLength, "Filename");
  for (const card of cards) {
    ensureMaxLength(card.front, Validation.flashcard.frontMaxLength, "Card front");
    ensureMaxLength(card.back, Validation.flashcard.backMaxLength, "Card back");
    ensureMaxItems(card.tags, Validation.flashcard.maxTags, "Card tags");
    for (const tag of card.tags) {
      ensureMaxLength(tag, Validation.flashcard.tagMaxLength, "Tag");
    }
  }

  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("create_deck_with_cards_and_charge", {
    p_user_id: deckInput.userId,
    p_title: deckInput.title,
    p_source_filename: deckInput.sourceFilename ?? null,
    p_generation_mode: deckInput.generationMode ?? null,
    p_pdf_type: deckInput.pdfType,
    p_cards: cards.map((c) => ({
      front: c.front,
      back: c.back,
      tags: c.tags,
      category: c.category,
    })),
  });
  if (error) throw toDbError(error, "Failed to save deck.");

  // RETURNS TABLE(deck_id, credits_remaining) → PostgREST yields an array of rows.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.deck_id) throw dbError(ApiErrorCode.INTERNAL_ERROR, "Failed to save deck.");

  return {
    deckId: String(row.deck_id),
    creditsRemaining: Number(row.credits_remaining ?? 0),
  };
}
