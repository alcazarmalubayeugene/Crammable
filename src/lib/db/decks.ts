import { createSessionClient } from "@/lib/supabase/server";
import {
  TableNames,
  type Deck,
  type Flashcard,
  type GeneratedCard,
  type GenerationMode,
  type PdfType,
} from "@/lib/contracts";
import { toDbError } from "@/lib/db/errors";
import { insertFlashcards } from "@/lib/db/flashcards";

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

/** Delete a deck (flashcards/quiz rows cascade via FK). */
export async function deleteDeck(deckId: string): Promise<void> {
  const supabase = await createSessionClient();
  const { error } = await supabase
    .from(TableNames.decks)
    .delete()
    .eq("id", deckId);
  if (error) throw toDbError(error, "Failed to delete deck.");
}

/**
 * Persist a generated deck and its cards together, then sync card_count.
 *
 * supabase-js can't wrap these inserts in one transaction, so on a card-insert
 * failure we compensate by deleting the just-created deck — leaving no orphan.
 * Credit deduction is intentionally NOT done here: call deductCredit() from the
 * route AFTER this resolves, so a persistence failure never charges the user.
 *
 * TODO(#5 generate): fold the deck + card inserts + deductCredit into one
 * create_deck_with_cards_and_charge() SECURITY DEFINER RPC for true atomicity;
 * the compensating delete below is the interim mitigation.
 */
export async function createDeckWithCards(
  deckInput: NewDeckInput,
  cards: GeneratedCard[]
): Promise<{ deck: Deck; cards: Flashcard[] }> {
  const deck = await createDeck(deckInput);

  let inserted: Flashcard[];
  try {
    inserted = await insertFlashcards(deck.id, deckInput.userId, cards);
  } catch (err) {
    // Compensating cleanup — best effort; swallow secondary errors.
    try {
      await deleteDeck(deck.id);
    } catch {
      /* deck cleanup failed; surface the original error below */
    }
    throw err;
  }

  await updateDeckCardCount(deck.id, inserted.length);
  return { deck: { ...deck, card_count: inserted.length }, cards: inserted };
}
