import type { NextRequest } from "next/server";
import {
  ApiErrorCode,
  QuizType,
  type Flashcard,
  type QuizQuestion,
  type StartQuizRequest,
  type StartQuizResult,
} from "@/lib/contracts";
import { handleApiError, apiSuccess, apiFail } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/api/csrf";
import { requireAuth } from "@/lib/auth/helpers";
import { getDeckById } from "@/lib/db/decks";
import { getFlashcardsForDeck } from "@/lib/db/flashcards";
import { createQuizSession } from "@/lib/db/quiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** In-place Fisher–Yates — unbiased and O(n), unlike sort(() => 0.5 - random). */
function shuffled<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function buildQuestions(cards: Flashcard[], quizType: QuizType): QuizQuestion[] {
  const canUseMC = cards.length >= 4;

  // Pre-bucket cards by category ONCE so distractor selection is O(n) overall
  // instead of filtering+shuffling the whole deck per card (O(n^2)).
  const byCategory = new Map<string, Flashcard[]>();
  for (const c of cards) {
    const bucket = byCategory.get(c.category);
    if (bucket) bucket.push(c);
    else byCategory.set(c.category, [c]);
  }

  return shuffled(cards).map((card): QuizQuestion => {
    let resolvedType: "multiple_choice" | "identification";
    if (quizType === QuizType.MIXED) {
      resolvedType =
        canUseMC && Math.random() < 0.5
          ? QuizType.MULTIPLE_CHOICE
          : QuizType.IDENTIFICATION;
    } else if (quizType === QuizType.MULTIPLE_CHOICE && canUseMC) {
      resolvedType = QuizType.MULTIPLE_CHOICE;
    } else {
      resolvedType = QuizType.IDENTIFICATION;
    }

    if (resolvedType === QuizType.MULTIPLE_CHOICE) {
      // Same-category distractors first for pedagogically coherent options;
      // fall back to cards from other categories if the category is too small.
      const sameCat = shuffled(
        (byCategory.get(card.category) ?? []).filter((c) => c.id !== card.id),
      );
      const otherCat = shuffled(
        cards.filter((c) => c.id !== card.id && c.category !== card.category),
      );
      const distractors = [...sameCat, ...otherCat].slice(0, 3).map((c) => c.back);
      const options = shuffled([...distractors, card.back]);
      return {
        flashcardId:  card.id,
        questionText: card.front,
        quizType:     QuizType.MULTIPLE_CHOICE,
        options,
        correctAnswer: card.back,
      };
    }

    return {
      flashcardId:  card.id,
      questionText: card.front,
      quizType:     QuizType.IDENTIFICATION,
      correctAnswer: card.back,
    };
  });
}

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  try {
    const csrf = assertSameOrigin(req);
    if (csrf) return csrf;

    const { user } = await requireAuth();
    const { id: deckId } = await params;

    let body: StartQuizRequest;
    try {
      body = (await req.json()) as StartQuizRequest;
    } catch {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Invalid request body.", 400);
    }

    if (!Object.values(QuizType).includes(body.quizType)) {
      return apiFail(ApiErrorCode.VALIDATION_ERROR, "Invalid quiz type.", 400);
    }

    // RLS: getDeckById returns null if the deck belongs to another user
    const deck = await getDeckById(deckId);
    if (!deck) {
      return apiFail(ApiErrorCode.FORBIDDEN, "Deck not found.", 404);
    }

    const cards = await getFlashcardsForDeck(deckId);
    if (cards.length === 0) {
      return apiFail(
        ApiErrorCode.VALIDATION_ERROR,
        "This deck has no cards yet.",
        422,
      );
    }

    const questions = buildQuestions(cards, body.quizType);
    const session = await createQuizSession({
      deckId,
      userId: user.id,
      quizType: body.quizType,
      totalQuestions: questions.length,
    });

    return apiSuccess<StartQuizResult>({ sessionId: session.id, questions });
  } catch (err) {
    return handleApiError(err);
  }
}
