import { describe, it, expect, vi, beforeEach } from "vitest";

// These suites assert the layer rejects over-limit input BEFORE it ever creates
// a Supabase client. The client factories are mocked to throw, proving the
// validation short-circuits ahead of any DB work.
vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: vi.fn(() => {
    throw new Error("createSessionClient must not be reached when validation fails");
  }),
}));

import { insertFlashcards } from "@/lib/db/flashcards";
import { createDeck } from "@/lib/db/decks";
import { updateOwnProfile } from "@/lib/db/profiles";
import { ensureMaxLength, ensureMaxItems } from "@/lib/db/validate";
import { DbError } from "@/lib/db/errors";
import { ApiErrorCode, PdfType, Validation, type GeneratedCard } from "@/lib/contracts";

const longString = (n: number) => "x".repeat(n);

beforeEach(() => vi.clearAllMocks());

describe("validate helpers", () => {
  it("ensureMaxLength throws VALIDATION_ERROR past the limit and passes at/under it", () => {
    expect(() => ensureMaxLength("ab", 1, "Field")).toThrowError(DbError);
    expect(() => ensureMaxLength("ab", 1, "Field")).toThrow(/1 characters or fewer/);
    expect(() => ensureMaxLength("a", 1, "Field")).not.toThrow();
    expect(() => ensureMaxLength(null, 1, "Field")).not.toThrow();
    expect(() => ensureMaxLength(undefined, 1, "Field")).not.toThrow();
  });

  it("ensureMaxItems throws past the limit", () => {
    expect(() => ensureMaxItems([1, 2], 1, "Tags")).toThrow(/1 or fewer items/);
    expect(() => ensureMaxItems([1], 1, "Tags")).not.toThrow();
  });

  it("carries VALIDATION_ERROR / 400", () => {
    try {
      ensureMaxLength("ab", 1, "Field");
    } catch (e) {
      expect(e).toMatchObject({ code: ApiErrorCode.VALIDATION_ERROR, status: 400 });
    }
  });
});

describe("insertFlashcards validation (M4)", () => {
  const ok: GeneratedCard = { front: "Q", back: "A", tags: ["t"], category: "General" };

  it("rejects an over-length front before any DB call", async () => {
    const cards: GeneratedCard[] = [
      { ...ok, front: longString(Validation.flashcard.frontMaxLength + 1) },
    ];
    await expect(insertFlashcards("d1", "u1", cards)).rejects.toMatchObject({
      code: ApiErrorCode.VALIDATION_ERROR,
    });
  });

  it("rejects an over-length back", async () => {
    const cards: GeneratedCard[] = [
      { ...ok, back: longString(Validation.flashcard.backMaxLength + 1) },
    ];
    await expect(insertFlashcards("d1", "u1", cards)).rejects.toBeInstanceOf(DbError);
  });

  it("rejects too many tags", async () => {
    const tags = Array.from({ length: Validation.flashcard.maxTags + 1 }, (_, i) => `t${i}`);
    await expect(insertFlashcards("d1", "u1", [{ ...ok, tags }])).rejects.toBeInstanceOf(DbError);
  });

  it("rejects an over-length tag", async () => {
    const cards: GeneratedCard[] = [
      { ...ok, tags: [longString(Validation.flashcard.tagMaxLength + 1)] },
    ];
    await expect(insertFlashcards("d1", "u1", cards)).rejects.toBeInstanceOf(DbError);
  });

  it("returns [] for an empty card list without validating or hitting the DB", async () => {
    await expect(insertFlashcards("d1", "u1", [])).resolves.toEqual([]);
  });
});

describe("createDeck validation (M4)", () => {
  it("rejects an over-length title before any DB call", async () => {
    await expect(
      createDeck({
        userId: "u1",
        title: longString(Validation.deck.titleMaxLength + 1),
        pdfType: PdfType.TEXT,
      })
    ).rejects.toMatchObject({ code: ApiErrorCode.VALIDATION_ERROR });
  });

  it("rejects an over-length source filename", async () => {
    await expect(
      createDeck({
        userId: "u1",
        title: "ok",
        sourceFilename: longString(Validation.deck.filenameMaxLength + 1),
        pdfType: PdfType.TEXT,
      })
    ).rejects.toBeInstanceOf(DbError);
  });
});

describe("updateOwnProfile validation (M4)", () => {
  it("rejects an over-length full_name before any DB call", async () => {
    await expect(
      updateOwnProfile("u1", { full_name: longString(Validation.profile.fullNameMaxLength + 1) })
    ).rejects.toMatchObject({ code: ApiErrorCode.VALIDATION_ERROR });
  });

  it("rejects an over-length course", async () => {
    await expect(
      updateOwnProfile("u1", { course: longString(Validation.profile.courseMaxLength + 1) })
    ).rejects.toBeInstanceOf(DbError);
  });
});
