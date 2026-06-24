"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { authHeaders } from "@/lib/api/auth-headers";
import { PageLoading } from "@/components/ui/PageLoading";
import { readPausedQuiz, clearPausedQuiz } from "@/lib/quiz/pauseState";
import { readDefaultQuizType, saveDefaultQuizType } from "@/lib/quiz/defaultQuizType";
import { Navbar } from "@/components/nav/Navbar";
import {
  ApiPaths,
  GenerationMode,
  QuizType,
  ReferralCaps,
  ReferralEventType,
  Routes,
  SubscriptionTier,
  TableNames,
  UIMessages,
  Validation,
  type ApiResponse,
  type CreateFlashcardRequest,
  type CreateFlashcardResult,
  type Deck,
  type DeleteFlashcardResult,
  type Flashcard,
  type QuizHistoryResult,
  type QuizHistoryRow,
  type RenameDeckRequest,
  type RenameDeckResult,
  type ReviewCardRequest,
  type ReviewCardResult,
  type ShareDeckResult,
  type UpdateFlashcardRequest,
  type UpdateFlashcardResult,
} from "@/lib/contracts";

interface MinProfile {
  token_balance: number;
  full_name: string | null;
  subscription_tier: (typeof SubscriptionTier)[keyof typeof SubscriptionTier];
}

// Shared style for the D1 add/edit-card form fields.
const inputStyle: CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 4,
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: "calc(13px * var(--font-scale))",
  color: "var(--text)",
  fontFamily: "var(--font-body, sans-serif)",
  boxSizing: "border-box",
};

export default function DeckDetailPage() {
  const params = useParams();
  const router = useRouter();
  const deckId = Array.isArray(params.id) ? params.id[0] : (params.id as string);

  const [profile, setProfile] = useState<MinProfile | null>(null);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [copied, setCopied] = useState(false);

  // D2 — inline deck title rename
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState("");

  // D1 — edit / delete the current card
  const [editingCard, setEditingCard] = useState(false);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [savingCard, setSavingCard] = useState(false);
  const [deletingCard, setDeletingCard] = useState(false);
  const [cardError, setCardError] = useState("");

  // D1 — add a new card
  const [addingCard, setAddingCard] = useState(false);
  const [newFront, setNewFront] = useState("");
  const [newBack, setNewBack] = useState("");
  const [newTags, setNewTags] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [savingNewCard, setSavingNewCard] = useState(false);
  const [addCardError, setAddCardError] = useState("");

  // D3 — quiz history for this deck
  const [history, setHistory] = useState<QuizHistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // D4 — study weak cards mode (sort by difficulty_score desc)
  const [studyWeakMode, setStudyWeakMode] = useState(false);

  // Default quiz sub-type for this deck — pre-selects on the quiz page's
  // setup screen but doesn't skip it (still changeable there).
  const [defaultQuizType, setDefaultQuizType] = useState<QuizType>(
    () => readDefaultQuizType(deckId) ?? QuizType.MULTIPLE_CHOICE
  );

  // Study-mode self-report — "Got it" / "Review again" on the flip card
  const [reviewingCard, setReviewingCard] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [lastReviewed, setLastReviewed] = useState<{ cardId: string; wasCorrect: boolean } | null>(null);
  // Card id → outcome, answered in THIS visit — separate from times_seen
  // (which persists across past quiz/study history). Free navigation
  // (arrows/dots) lets you jump straight to the last card without ever
  // answering the ones before it; tracked here so auto-advance can route back
  // to whatever's still unanswered instead of dead-ending on the last card,
  // and so the dot indicators can badge which cards are already done.
  const [reviewedThisVisit, setReviewedThisVisit] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    const timeout = setTimeout(() => {
      setError("Taking too long to load. Check your connection and refresh.");
      setLoading(false);
    }, 10_000);

    async function load() {
      try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        window.location.replace(Routes.login);
        return;
      }

      // Profile stays a direct (RLS-scoped) read — no profile API route exists.
      // Deck + cards now come from GET /api/decks/[id] (cookie-auth; the route
      // enforces ownership server-side and 404s for non-owned/missing decks).
      const [profileRes, deckRes] = await Promise.all([
        supabase
          .from(TableNames.profiles)
          .select("token_balance, full_name, subscription_tier")
          .eq("id", user.id)
          .single(),
        fetch(ApiPaths.deck(deckId)),
      ]);

      const deckJson = (await deckRes.json()) as {
        success: boolean;
        deck?: Deck;
        cards?: Flashcard[];
        error?: { message: string };
      };

      if (!deckJson.success || !deckJson.deck) {
        setError("Deck not found or you don't have access to it.");
        setLoading(false);
        return;
      }

      setProfile(profileRes.data);
      setDeck(deckJson.deck);
      setCards(deckJson.cards ?? []);
      setLoading(false);
      } finally {
        clearTimeout(timeout);
      }
    }
    load();
    return () => clearTimeout(timeout);
  }, [deckId]);

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      setLoadingHistory(true);
      try {
        const res = await fetch(`${ApiPaths.quizHistory}?deckId=${deckId}`, {
          headers: await authHeaders(),
        });
        const data = (await res.json()) as ApiResponse<QuizHistoryResult>;
        if (!cancelled && data.success) setHistory(data.sessions);
      } catch {
        // Quiz history is supplementary — fail silently.
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    }
    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  // Adding a card mid-session (or any future card with a fresh times_seen: 0)
  // can flip a deck from "fully passed" back to not — drop out of weak-cards
  // mode automatically rather than leaving it on with a now-locked toggle.
  useEffect(() => {
    if (studyWeakMode && !(cards.length > 0 && cards.every((c) => c.times_seen > 0))) {
      setStudyWeakMode(false);
    }
  }, [cards, studyWeakMode]);

  function goTo(idx: number) {
    setCurrentIdx(idx);
    setIsFlipped(false);
    setReviewError("");
  }

  // Wraps forward from just past `fromIdx` looking for a card not yet in
  // `reviewed`; wraps back around through the start of the deck if needed.
  // Returns `fromIdx` unchanged if every card is already reviewed.
  function findNextUnanswered(deckCards: Flashcard[], fromIdx: number, reviewed: Map<string, boolean>): number {
    const n = deckCards.length;
    for (let step = 1; step <= n; step++) {
      const idx = (fromIdx + step) % n;
      if (!reviewed.has(deckCards[idx].id)) return idx;
    }
    return fromIdx;
  }

  async function submitCardReview(wasCorrect: boolean) {
    if (!card || reviewingCard) return;
    setReviewingCard(true);
    setReviewError("");

    // Answering judges you against the actual answer, so reveal it (smooth
    // 3D-flip already on the card) the moment you answer if you haven't
    // already flipped it yourself — never on its own, only as a result of
    // clicking Got it/Review again. Runs concurrently with the network
    // request (not stacked after it) — just a floor so the rotation always
    // gets to finish playing even if the API responds faster than that.
    const needsFlip = !isFlipped;
    if (needsFlip) setIsFlipped(true);
    const minReveal = new Promise<void>((resolve) => setTimeout(resolve, needsFlip ? 600 : 250));

    try {
      const [res] = await Promise.all([
        fetch(ApiPaths.flashcardReview(card.id), {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ wasCorrect } satisfies ReviewCardRequest),
        }),
        minReveal,
      ]);
      const data = (await res.json()) as ApiResponse<ReviewCardResult>;
      if (!data.success) {
        setReviewError(data.error.message);
        return;
      }
      setCards((cs) =>
        cs.map((c) =>
          c.id === card.id
            ? { ...c, difficulty_score: data.newDifficultyScore, times_seen: c.times_seen + 1 }
            : c
        )
      );
      setLastReviewed({ cardId: card.id, wasCorrect });
      const updatedReviewed = new Map(reviewedThisVisit).set(card.id, wasCorrect);
      setReviewedThisVisit(updatedReviewed);
      goTo(findNextUnanswered(displayCards, currentIdx, updatedReviewed));
    } catch {
      setReviewError(UIMessages.genericError);
    } finally {
      setReviewingCard(false);
    }
  }

  async function handleDelete() {
    if (!deck) return;
    if (!confirm(`Delete "${deck.title}"? This can't be undone.`)) return;

    setDeleting(true);
    const res = await fetch(ApiPaths.deck(deckId), { method: "DELETE" });
    const json = (await res.json()) as { success: boolean; error?: { message: string } };

    if (!json.success) {
      setError(json.error?.message ?? "Failed to delete deck. Please try again.");
      setDeleting(false);
      return;
    }

    router.push(Routes.dashboard);
  }

  async function toggleShare() {
    if (!deck) return;
    setSharing(true);
    setShareMessage("");
    try {
      const res = await fetch(ApiPaths.deckShare(deckId), {
        method: deck.is_public ? "DELETE" : "POST",
        headers: await authHeaders(),
      });
      const data = (await res.json()) as ApiResponse<ShareDeckResult>;
      if (!data.success) {
        setShareMessage(data.error.message);
        return;
      }
      setDeck((d) => d ? { ...d, is_public: data.isPublic } : d);
      if (data.creditsAwarded > 0) {
        setShareMessage(`Deck shared! +${data.creditsAwarded} Capycoins earned.`);
      }
    } catch {
      setShareMessage(UIMessages.genericError);
    } finally {
      setSharing(false);
    }
  }

  async function copyShareLink() {
    if (typeof window === "undefined") return;
    await navigator.clipboard.writeText(`${window.location.origin}${Routes.publicDeck(deckId)}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── D2: rename deck ──────────────────────────────────────────────────────
  function startEditTitle() {
    if (!deck) return;
    setTitleInput(deck.title);
    setTitleError("");
    setEditingTitle(true);
  }

  async function saveTitle() {
    const title = titleInput.trim();
    if (!title) {
      setTitleError("Title is required.");
      return;
    }
    if (title.length > Validation.deck.titleMaxLength) {
      setTitleError(`Title must be ${Validation.deck.titleMaxLength} characters or fewer.`);
      return;
    }
    setSavingTitle(true);
    setTitleError("");
    try {
      const res = await fetch(ApiPaths.deck(deckId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ title } satisfies RenameDeckRequest),
      });
      const data = (await res.json()) as ApiResponse<RenameDeckResult>;
      if (!data.success) {
        setTitleError(data.error.message);
        return;
      }
      setDeck(data.deck);
      setEditingTitle(false);
    } catch {
      setTitleError(UIMessages.genericError);
    } finally {
      setSavingTitle(false);
    }
  }

  // ── D1: edit / delete the current card ──────────────────────────────────
  function startEditCard() {
    if (!card) return;
    setEditFront(card.front);
    setEditBack(card.back);
    setEditTags((card.tags ?? []).join(", "));
    setEditCategory(card.category ?? "");
    setCardError("");
    setEditingCard(true);
    setIsFlipped(false);
  }

  async function saveCardEdit() {
    if (!card) return;
    const front = editFront.trim();
    const back = editBack.trim();
    if (!front || !back) {
      setCardError("Front and back are required.");
      return;
    }
    const tags = editTags.split(",").map((t) => t.trim()).filter(Boolean);
    setSavingCard(true);
    setCardError("");
    try {
      const res = await fetch(ApiPaths.flashcard(card.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          front,
          back,
          tags,
          category: editCategory.trim(),
        } satisfies UpdateFlashcardRequest),
      });
      const data = (await res.json()) as ApiResponse<UpdateFlashcardResult>;
      if (!data.success) {
        setCardError(data.error.message);
        return;
      }
      setCards((cs) => cs.map((c) => (c.id === data.card.id ? data.card : c)));
      setEditingCard(false);
    } catch {
      setCardError(UIMessages.genericError);
    } finally {
      setSavingCard(false);
    }
  }

  async function deleteCurrentCard() {
    if (!card) return;
    if (typeof window !== "undefined" && !window.confirm("Delete this card? This can't be undone.")) {
      return;
    }
    setDeletingCard(true);
    setCardError("");
    try {
      const res = await fetch(ApiPaths.flashcard(card.id), {
        method: "DELETE",
        headers: await authHeaders(),
      });
      const data = (await res.json()) as ApiResponse<DeleteFlashcardResult>;
      if (!data.success) {
        setCardError(data.error.message);
        return;
      }
      setCards((cs) => cs.filter((c) => c.id !== data.flashcardId));
      setDeck((d) => (d ? { ...d, card_count: data.cardCount } : d));
      setCurrentIdx((idx) => Math.max(0, Math.min(idx, cards.length - 2)));
      setIsFlipped(false);
      setEditingCard(false);
    } catch {
      setCardError(UIMessages.genericError);
    } finally {
      setDeletingCard(false);
    }
  }

  // ── D1: add a new card ───────────────────────────────────────────────────
  async function addCard() {
    const front = newFront.trim();
    const back = newBack.trim();
    if (!front || !back) {
      setAddCardError("Front and back are required.");
      return;
    }
    const tags = newTags.split(",").map((t) => t.trim()).filter(Boolean);
    setSavingNewCard(true);
    setAddCardError("");
    try {
      const res = await fetch(ApiPaths.deckFlashcards(deckId), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          front,
          back,
          tags,
          category: newCategory.trim(),
        } satisfies CreateFlashcardRequest),
      });
      const data = (await res.json()) as ApiResponse<CreateFlashcardResult>;
      if (!data.success) {
        setAddCardError(data.error.message);
        return;
      }
      setCards((cs) => [...cs, data.card]);
      setDeck((d) => (d ? { ...d, card_count: data.cardCount } : d));
      setNewFront("");
      setNewBack("");
      setNewTags("");
      setNewCategory("");
      setAddingCard(false);
      setCurrentIdx(cards.length);
      setIsFlipped(false);
    } catch {
      setAddCardError(UIMessages.genericError);
    } finally {
      setSavingNewCard(false);
    }
  }

  // ── D4: study weak cards mode ───────────────────────────────────────────
  function toggleStudyWeakMode() {
    setStudyWeakMode((m) => !m);
    setCurrentIdx(0);
    setIsFlipped(false);
    setEditingCard(false);
  }

  const displayCards = studyWeakMode
    ? [...cards].sort((a, b) => b.difficulty_score - a.difficulty_score)
    : cards;
  const card = displayCards[currentIdx] ?? null;
  const total = displayCards.length;
  // difficulty_score only diverges between cards once each has actually been
  // reviewed at least once (study mode or quiz both bump times_seen) — before
  // that every card is sitting at its untouched default, so "weak cards" has
  // nothing real to sort by yet.
  const hasCompletedFullPass = cards.length > 0 && cards.every((c) => c.times_seen > 0);
  // Only meaningful once we're past the loading gate below (client-only read).
  const pausedQuiz = readPausedQuiz(deckId);

  if (loading) {
    return <PageLoading />;
  }

  if (error || !deck) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "var(--bg)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          fontFamily: "var(--font-body, sans-serif)",
        }}
      >
        <p style={{ color: "var(--text-muted)", fontSize: "calc(15px * var(--font-scale))" }}>{error || "Deck not found."}</p>
        <a
          href={Routes.dashboard}
          style={{ color: "var(--primary)", textDecoration: "none", fontWeight: 600, fontSize: "calc(14px * var(--font-scale))" }}
        >
          ← Back to Dashboard
        </a>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        fontFamily: "var(--font-body, sans-serif)",
      }}
    >
      {/* ── NAVBAR ── */}
      <Navbar
        backHref={Routes.dashboard}
        coinBalance={profile?.token_balance}
        userName={profile?.full_name ? profile.full_name.split(" ")[0] : undefined}
        showAvatarMenu={!!profile}
      />

      {/* ── CONTENT ── */}
      <div className="page-content" style={{ maxWidth: 860, margin: "0 auto" }}>

        {/* Deck header */}
        <div className="section-gap">
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div>
              {editingTitle ? (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="text"
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.target.value)}
                      maxLength={Validation.deck.titleMaxLength}
                      autoFocus
                      style={{
                        fontFamily: "var(--font-display, serif)",
                        fontSize: "calc(22px * var(--font-scale))",
                        fontWeight: 700,
                        color: "var(--text)",
                        background: "var(--bg-card)",
                        border: "1.5px solid var(--border)",
                        borderRadius: 8,
                        padding: "6px 10px",
                        minWidth: 240,
                      }}
                    />
                    <button
                      type="button"
                      onClick={saveTitle}
                      disabled={savingTitle}
                      style={{
                        background: "var(--primary)",
                        color: "var(--nav-text)",
                        border: "none",
                        borderRadius: 8,
                        padding: "8px 14px",
                        fontSize: "calc(13px * var(--font-scale))",
                        fontWeight: 600,
                        cursor: savingTitle ? "not-allowed" : "pointer",
                        fontFamily: "var(--font-body, sans-serif)",
                      }}
                    >
                      {savingTitle ? "…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditingTitle(false); setTitleError(""); }}
                      disabled={savingTitle}
                      style={{
                        background: "var(--bg-card)",
                        color: "var(--text-muted)",
                        border: "1.5px solid var(--border)",
                        borderRadius: 8,
                        padding: "8px 14px",
                        fontSize: "calc(13px * var(--font-scale))",
                        fontWeight: 600,
                        cursor: savingTitle ? "not-allowed" : "pointer",
                        fontFamily: "var(--font-body, sans-serif)",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  {titleError && (
                    <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--error-dark)", marginTop: 6 }}>{titleError}</p>
                  )}
                </div>
              ) : (
                <h1
                  style={{
                    fontFamily: "var(--font-display, serif)",
                    fontSize: "calc(28px * var(--font-scale))",
                    fontWeight: 700,
                    color: "var(--text)",
                    marginBottom: 6,
                    lineHeight: 1.25,
                  }}
                >
                  {deck.title}
                  {deck.generation_mode === GenerationMode.DEEP_DIVE && (
                    <span
                      style={{
                        marginLeft: 10,
                        fontSize: "calc(11px * var(--font-scale))",
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "var(--primary)",
                        background: "rgba(196,122,46,0.15)",
                        borderRadius: 6,
                        padding: "3px 8px",
                        verticalAlign: "middle",
                      }}
                    >
                      Deep Dive
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={startEditTitle}
                    title="Rename deck"
                    aria-label="Rename deck"
                    style={{
                      marginLeft: 10,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "calc(16px * var(--font-scale))",
                      color: "var(--text-faint)",
                      verticalAlign: "middle",
                    }}
                  >
                    ✏️
                  </button>
                </h1>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-muted)" }}>
                  {total} {total === 1 ? "card" : "cards"}
                </span>
                {deck.source_filename && (
                  <>
                    <span style={{ color: "var(--border)" }}>·</span>
                    <span
                      style={{
                        fontSize: "calc(13px * var(--font-scale))",
                        color: "var(--text-muted)",
                        maxWidth: 240,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {deck.source_filename}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {total > 0 && (
                <>
                  {profile?.subscription_tier === SubscriptionTier.PRO ? (
                    <a
                      href={ApiPaths.deckExport(deckId)}
                      download
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        background: "var(--bg-card)",
                        border: "1.5px solid var(--border)",
                        color: "var(--text)",
                        padding: "10px 20px",
                        borderRadius: 10,
                        fontWeight: 600,
                        fontSize: "calc(14px * var(--font-scale))",
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Export PDF
                    </a>
                  ) : (
                    <span className="tooltip-wrap" style={{ display: "inline-flex", position: "relative" }}>
                      <a
                        href={Routes.upgrade}
                        title={UIMessages.proFeatureLocked}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          background: "var(--bg-card)",
                          border: "1.5px solid var(--border)",
                          color: "var(--text-faint)",
                          padding: "10px 20px",
                          borderRadius: 10,
                          fontWeight: 600,
                          fontSize: "calc(14px * var(--font-scale))",
                          textDecoration: "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Export PDF (Pro)
                      </a>
                      <span className="tooltip-bubble">{UIMessages.proFeatureLocked}</span>
                    </span>
                  )}
                  <a
                    href={Routes.quiz(deckId)}
                    className="quiz-pill"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      background: "var(--primary)",
                      color: "var(--on-primary)",
                      padding: "11px 24px",
                      borderRadius: 10,
                      fontWeight: 600,
                      fontSize: "calc(14px * var(--font-scale))",
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {pausedQuiz ? "Continue Quiz →" : "Start Quiz →"}
                  </a>
                </>
              )}
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="btn-outline-danger"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: "transparent",
                  color: "var(--error)",
                  border: "1.5px solid var(--border)",
                  padding: "11px 20px",
                  borderRadius: 10,
                  fontWeight: 600,
                  fontSize: "calc(14px * var(--font-scale))",
                  cursor: deleting ? "not-allowed" : "pointer",
                  opacity: deleting ? 0.6 : 1,
                  fontFamily: "var(--font-body, sans-serif)",
                  whiteSpace: "nowrap",
                }}
              >
                {deleting ? "Deleting…" : "Delete deck"}
              </button>
            </div>
          </div>
        </div>

        {/* Share / public link (B4 deck_share + B5 public decks) */}
        {deck && (
          <div
            className="section-gap"
            style={{
              background: "var(--bg-card)",
              border: "1.5px solid var(--border)",
              borderRadius: 10,
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <p style={{ fontSize: "calc(13px * var(--font-scale))", fontWeight: 600, color: "var(--text)", margin: "0 0 2px" }}>
                  {deck.is_public ? "This deck is public" : "Share this deck"}
                </p>
                <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", margin: 0 }}>
                  {deck.is_public
                    ? "Anyone with the link can view (read-only)."
                    : `Share publicly to let others view it. Decks with ≥${(ReferralCaps[ReferralEventType.DECK_SHARE] as { minCards: number }).minCards} cards earn +${ReferralCaps[ReferralEventType.DECK_SHARE].creditsAwarded} Capycoins (once per deck).`}
                </p>
              </div>
              <button
                type="button"
                onClick={toggleShare}
                disabled={sharing}
                className={deck.is_public ? "btn-outline" : "btn-solid"}
                style={{
                  background: deck.is_public ? "var(--bg-card)" : "var(--primary)",
                  border: deck.is_public ? "1.5px solid var(--border)" : "none",
                  color: deck.is_public ? "var(--text-muted)" : "var(--on-primary)",
                  padding: "8px 16px",
                  borderRadius: 8,
                  fontSize: "calc(13px * var(--font-scale))",
                  fontWeight: 600,
                  cursor: sharing ? "not-allowed" : "pointer",
                  fontFamily: "var(--font-body, sans-serif)",
                  whiteSpace: "nowrap",
                }}
              >
                {sharing ? "…" : deck.is_public ? "Make private" : "Make public"}
              </button>
            </div>

            {deck.is_public && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <code
                  style={{
                    fontSize: "calc(12px * var(--font-scale))",
                    color: "var(--text)",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    flex: 1,
                    minWidth: 200,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {Routes.publicDeck(deckId)}
                </code>
                <button
                  type="button"
                  onClick={copyShareLink}
                  style={{
                    background: copied ? "var(--success)" : "var(--bg-card)",
                    border: "1.5px solid var(--border)",
                    color: copied ? "var(--nav-text)" : "var(--text)",
                    padding: "6px 14px",
                    borderRadius: 8,
                    fontSize: "calc(12px * var(--font-scale))",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "var(--font-body, sans-serif)",
                  }}
                >
                  {copied ? "✓ Copied!" : "Copy link"}
                </button>
              </div>
            )}

            {shareMessage && (
              <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--success)", fontWeight: 600, margin: 0 }}>{shareMessage}</p>
            )}
          </div>
        )}

        {/* AI disclaimer — required on every generated deck page */}
        <div
          className="section-gap"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "12px 16px",
          }}
        >
          <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", lineHeight: 1.6, margin: 0 }}>
            ⚠️ {UIMessages.aiDisclaimer}
          </p>
        </div>

        {/* D1 — card management toolbar */}
        <div
          className="section-gap"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          {total > 0 ? (
            hasCompletedFullPass ? (
              <button
                type="button"
                onClick={toggleStudyWeakMode}
                className={studyWeakMode ? "btn-solid" : "btn-outline"}
                style={{
                  background: studyWeakMode ? "var(--primary)" : "var(--bg-card)",
                  border: "1.5px solid var(--border)",
                  color: studyWeakMode ? "var(--on-primary)" : "var(--text)",
                  padding: "8px 16px",
                  borderRadius: 8,
                  fontSize: "calc(13px * var(--font-scale))",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "var(--font-body, sans-serif)",
                }}
              >
                {studyWeakMode ? "✓ Studying weak cards" : "Study weak cards"}
              </button>
            ) : (
              <span className="tooltip-wrap" style={{ display: "inline-flex", position: "relative" }}>
                <button
                  type="button"
                  disabled
                  title={UIMessages.studyWeakCardsLocked}
                  className="btn-outline"
                  style={{
                    background: "var(--bg-card)",
                    border: "1.5px solid var(--border)",
                    color: "var(--text-faint)",
                    padding: "8px 16px",
                    borderRadius: 8,
                    fontSize: "calc(13px * var(--font-scale))",
                    fontWeight: 600,
                    cursor: "not-allowed",
                    fontFamily: "var(--font-body, sans-serif)",
                  }}
                >
                  Study weak cards
                </button>
                <span className="tooltip-bubble">{UIMessages.studyWeakCardsLocked}</span>
              </span>
            )
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => {
              setAddingCard((a) => !a);
              setAddCardError("");
            }}
            className="btn-outline"
            style={{
              background: "var(--bg-card)",
              border: "1.5px solid var(--border)",
              color: "var(--text)",
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: "calc(13px * var(--font-scale))",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "var(--font-body, sans-serif)",
            }}
          >
            {addingCard ? "Cancel" : "+ Add card"}
          </button>
        </div>

        {/* D1 — add-card form */}
        {addingCard && (
          <div
            style={{
              background: "var(--bg-card)",
              border: "1.5px solid var(--border)",
              borderRadius: 14,
              padding: 18,
              marginBottom: 20,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <label style={{ fontSize: "calc(12px * var(--font-scale))", fontWeight: 600, color: "var(--text-muted)" }}>
              Front
              <textarea
                value={newFront}
                onChange={(e) => setNewFront(e.target.value)}
                maxLength={Validation.flashcard.frontMaxLength}
                rows={2}
                style={inputStyle}
              />
            </label>
            <label style={{ fontSize: "calc(12px * var(--font-scale))", fontWeight: 600, color: "var(--text-muted)" }}>
              Back
              <textarea
                value={newBack}
                onChange={(e) => setNewBack(e.target.value)}
                maxLength={Validation.flashcard.backMaxLength}
                rows={3}
                style={inputStyle}
              />
            </label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={{ fontSize: "calc(12px * var(--font-scale))", fontWeight: 600, color: "var(--text-muted)", flex: 1, minWidth: 160 }}>
                Category
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  maxLength={Validation.flashcard.categoryMaxLength}
                  style={inputStyle}
                />
              </label>
              <label style={{ fontSize: "calc(12px * var(--font-scale))", fontWeight: 600, color: "var(--text-muted)", flex: 2, minWidth: 200 }}>
                Tags (comma-separated)
                <input
                  type="text"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  style={inputStyle}
                />
              </label>
            </div>
            {addCardError && (
              <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--error-dark)", margin: 0 }}>{addCardError}</p>
            )}
            <div>
              <button
                type="button"
                onClick={addCard}
                disabled={savingNewCard}
                style={{
                  background: "var(--primary)",
                  color: "var(--nav-text)",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 20px",
                  fontSize: "calc(13px * var(--font-scale))",
                  fontWeight: 600,
                  cursor: savingNewCard ? "not-allowed" : "pointer",
                  fontFamily: "var(--font-body, sans-serif)",
                }}
              >
                {savingNewCard ? "Adding…" : "Add card"}
              </button>
            </div>
          </div>
        )}

        {/* Flashcard viewer */}
        {total === 0 ? (
          <div
            style={{
              background: "var(--bg-card)",
              border: "1.5px dashed var(--border)",
              borderRadius: 20,
              padding: "60px 24px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "calc(48px * var(--font-scale))", marginBottom: 12 }}>📭</div>
            <p style={{ color: "var(--text-muted)", fontSize: "calc(15px * var(--font-scale))" }}>This deck has no cards yet.</p>
          </div>
        ) : (
          <>
            {/* Progress header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <span style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-muted)" }}>
                Card {currentIdx + 1} of {total}
                {studyWeakMode && card && (
                  <span style={{ color: "var(--text-faint)" }}> · difficulty {Math.round(card.difficulty_score * 100)}%</span>
                )}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {!editingCard && (
                  <>
                    <button
                      type="button"
                      onClick={startEditCard}
                      className="text-link"
                      style={{ background: "none", border: "none", color: "var(--primary)", fontSize: "calc(12px * var(--font-scale))", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body, sans-serif)" }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={deleteCurrentCard}
                      disabled={deletingCard}
                      className="text-link-danger"
                      style={{ background: "none", border: "none", color: "var(--error-dark)", fontSize: "calc(12px * var(--font-scale))", fontWeight: 600, cursor: deletingCard ? "not-allowed" : "pointer", fontFamily: "var(--font-body, sans-serif)" }}
                    >
                      {deletingCard ? "Deleting…" : "Delete"}
                    </button>
                  </>
                )}
                {editingCard && (
                  <span style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-faint)" }}>
                    Editing card
                  </span>
                )}
              </div>
            </div>

            {cardError && (
              <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--error-dark)", marginBottom: 10 }}>{cardError}</p>
            )}

            {/* Progress bar */}
            <div
              style={{
                height: 4,
                background: "var(--border)",
                borderRadius: 4,
                marginBottom: 20,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  background: "var(--primary)",
                  borderRadius: 4,
                  width: `${((currentIdx + 1) / total) * 100}%`,
                  transition: "width 0.3s",
                }}
              />
            </div>

            {/* Edit-card form (D1) */}
            {editingCard && (
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1.5px solid var(--border)",
                  borderRadius: 14,
                  padding: 18,
                  marginBottom: 20,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <label style={{ fontSize: "calc(12px * var(--font-scale))", fontWeight: 600, color: "var(--text-muted)" }}>
                  Front
                  <textarea
                    value={editFront}
                    onChange={(e) => setEditFront(e.target.value)}
                    maxLength={Validation.flashcard.frontMaxLength}
                    rows={2}
                    style={inputStyle}
                  />
                </label>
                <label style={{ fontSize: "calc(12px * var(--font-scale))", fontWeight: 600, color: "var(--text-muted)" }}>
                  Back
                  <textarea
                    value={editBack}
                    onChange={(e) => setEditBack(e.target.value)}
                    maxLength={Validation.flashcard.backMaxLength}
                    rows={3}
                    style={inputStyle}
                  />
                </label>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <label style={{ fontSize: "calc(12px * var(--font-scale))", fontWeight: 600, color: "var(--text-muted)", flex: 1, minWidth: 160 }}>
                    Category
                    <input
                      type="text"
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      maxLength={Validation.flashcard.categoryMaxLength}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ fontSize: "calc(12px * var(--font-scale))", fontWeight: 600, color: "var(--text-muted)", flex: 2, minWidth: 200 }}>
                    Tags (comma-separated)
                    <input
                      type="text"
                      value={editTags}
                      onChange={(e) => setEditTags(e.target.value)}
                      style={inputStyle}
                    />
                  </label>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    onClick={saveCardEdit}
                    disabled={savingCard}
                    style={{
                      background: "var(--primary)",
                      color: "var(--nav-text)",
                      border: "none",
                      borderRadius: 8,
                      padding: "10px 20px",
                      fontSize: "calc(13px * var(--font-scale))",
                      fontWeight: 600,
                      cursor: savingCard ? "not-allowed" : "pointer",
                      fontFamily: "var(--font-body, sans-serif)",
                    }}
                  >
                    {savingCard ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingCard(false); setCardError(""); }}
                    disabled={savingCard}
                    style={{
                      background: "var(--bg-card)",
                      color: "var(--text-muted)",
                      border: "1.5px solid var(--border)",
                      borderRadius: 8,
                      padding: "10px 20px",
                      fontSize: "calc(13px * var(--font-scale))",
                      fontWeight: 600,
                      cursor: savingCard ? "not-allowed" : "pointer",
                      fontFamily: "var(--font-body, sans-serif)",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Flip card */}
            {!editingCard && (
            <div
              onClick={() => setIsFlipped((f) => !f)}
              style={{ perspective: "1200px", cursor: "pointer", marginBottom: 20 }}
              role="button"
              aria-label={isFlipped ? "Show front of card" : "Show back of card"}
            >
              <div
                style={{
                  position: "relative",
                  height: 260,
                  transformStyle: "preserve-3d",
                  transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                  transition: "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              >
                {/* Front face */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    backfaceVisibility: "hidden",
                    background: "var(--bg-card)",
                    border: "1.5px solid var(--border)",
                    borderRadius: 20,
                    padding: "32px",
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "auto",
                  }}
                >
                  <span
                    style={{
                      fontSize: "calc(11px * var(--font-scale))",
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      color: "var(--text-faint)",
                      textTransform: "uppercase",
                      marginBottom: 16,
                    }}
                  >
                    Front
                  </span>
                  <p
                    style={{
                      fontFamily: "var(--font-display, serif)",
                      fontSize: "calc(20px * var(--font-scale))",
                      fontWeight: 600,
                      color: "var(--text)",
                      textAlign: "center",
                      lineHeight: 1.5,
                      margin: 0,
                    }}
                  >
                    {card?.front}
                  </p>
                </div>

                {/* Back face */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    backfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                    background: "var(--nav-bg)",
                    border: "1.5px solid var(--primary)",
                    borderRadius: 20,
                    padding: "32px",
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "auto",
                  }}
                >
                  <span
                    style={{
                      fontSize: "calc(11px * var(--font-scale))",
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      color: "var(--text-faint)",
                      textTransform: "uppercase",
                      marginBottom: 16,
                    }}
                  >
                    Back
                  </span>
                  <p
                    style={{
                      fontFamily: "var(--font-display, serif)",
                      fontSize: "calc(18px * var(--font-scale))",
                      fontWeight: 500,
                      color: "var(--nav-text)",
                      textAlign: "center",
                      lineHeight: 1.6,
                      margin: 0,
                    }}
                  >
                    {card?.back}
                  </p>
                  {card?.tags && card.tags.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 6,
                        marginTop: 16,
                        justifyContent: "center",
                      }}
                    >
                      {card.tags.map((tag) => (
                        <span
                          key={tag}
                          style={{
                            fontSize: "calc(11px * var(--font-scale))",
                            color: "var(--text-faint)",
                            background: "rgba(196,122,46,0.2)",
                            borderRadius: 12,
                            padding: "3px 10px",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            )}

            {!editingCard && (
              <p style={{ textAlign: "center", fontSize: "calc(12px * var(--font-scale))", color: "var(--text-faint)", marginBottom: 14 }}>
                {isFlipped ? "Click card to flip back" : "Click card to view answer"}
              </p>
            )}

            {/* Study-mode self-report */}
            {!editingCard && (
              <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 20 }}>
                <button
                  type="button"
                  onClick={() => submitCardReview(true)}
                  disabled={reviewingCard}
                  className={`btn-review-correct${lastReviewed?.cardId === card?.id && lastReviewed.wasCorrect ? " is-active" : ""}`}
                  style={{
                    borderRadius: 10,
                    padding: "10px 22px",
                    fontSize: "calc(13px * var(--font-scale))",
                    fontWeight: 600,
                    cursor: reviewingCard ? "not-allowed" : "pointer",
                    opacity: reviewingCard ? 0.6 : 1,
                    fontFamily: "var(--font-body, sans-serif)",
                  }}
                >
                  ✓ Got it
                </button>
                <button
                  type="button"
                  onClick={() => submitCardReview(false)}
                  disabled={reviewingCard}
                  className={`btn-review-wrong${lastReviewed?.cardId === card?.id && !lastReviewed.wasCorrect ? " is-active" : ""}`}
                  style={{
                    borderRadius: 10,
                    padding: "10px 22px",
                    fontSize: "calc(13px * var(--font-scale))",
                    fontWeight: 600,
                    cursor: reviewingCard ? "not-allowed" : "pointer",
                    opacity: reviewingCard ? 0.6 : 1,
                    fontFamily: "var(--font-body, sans-serif)",
                  }}
                >
                  ✗ Review again
                </button>
              </div>
            )}
            {reviewError && (
              <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--error-dark)", textAlign: "center", marginTop: -10, marginBottom: 16 }}>
                {reviewError}
              </p>
            )}

            {/* Navigation controls */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
              }}
            >
              <button
                onClick={() => goTo(Math.max(0, currentIdx - 1))}
                disabled={currentIdx === 0}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  border: "1.5px solid var(--border)",
                  background: "var(--bg-card)",
                  color: "var(--text)",
                  fontSize: "calc(18px * var(--font-scale))",
                  cursor: currentIdx === 0 ? "not-allowed" : "pointer",
                  opacity: currentIdx === 0 ? 0.35 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-body, sans-serif)",
                }}
                aria-label="Previous card"
              >
                ←
              </button>

              {/* Dot indicators — every card gets one, wrapping onto extra
                  rows for larger decks (was capped at 12 + a plain "+N" text
                  count, which meant the current dot and every answered badge
                  past card 12 were simply invisible — for an 18-of-20 card,
                  there was no dot at all to show it, current or answered).
                  Position (current card) and outcome (answered green/red)
                  are two independent signals, so they get two independent
                  visual channels instead of fighting over one fill color:
                  outcome is always the fill (gray/green/red regardless of
                  current-ness), current-ness is always a gold ring + the
                  wider pill shape, regardless of fill color. Iterates
                  displayCards, not cards — weak-cards mode re-sorts, so index
                  i needs the card actually shown at that position, not raw
                  insertion order. */}
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
                {displayCards.map((c, i) => {
                  const outcome = reviewedThisVisit.get(c.id);
                  const fill = outcome === undefined ? "var(--border)" : outcome ? "var(--success)" : "var(--error)";
                  const isCurrent = i === currentIdx;
                  return (
                    <button
                      key={c.id}
                      onClick={() => goTo(i)}
                      style={{
                        width: isCurrent ? 20 : 8,
                        height: 8,
                        borderRadius: 4,
                        background: fill,
                        border: isCurrent ? "1.5px solid var(--primary)" : "none",
                        padding: 0,
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                      aria-label={`Go to card ${i + 1}${
                        outcome === undefined ? "" : outcome ? " (answered: got it)" : " (answered: review again)"
                      }${isCurrent ? " (current)" : ""}`}
                    />
                  );
                })}
              </div>

              <button
                onClick={() => goTo(Math.min(total - 1, currentIdx + 1))}
                disabled={currentIdx === total - 1}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  border: "1.5px solid var(--border)",
                  background: "var(--bg-card)",
                  color: "var(--text)",
                  fontSize: "calc(18px * var(--font-scale))",
                  cursor: currentIdx === total - 1 ? "not-allowed" : "pointer",
                  opacity: currentIdx === total - 1 ? 0.35 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-body, sans-serif)",
                }}
                aria-label="Next card"
              >
                →
              </button>
            </div>

            {/* Quiz CTA — bottom */}
            <div style={{ textAlign: "center", marginTop: 36, paddingTop: 28, borderTop: "1px solid var(--border)" }}>
              <p style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--text-muted)", marginBottom: 14 }}>
                {pausedQuiz
                  ? "Want a clean slate? This resets your progress and re-quizzes the whole deck from question 1."
                  : `Feeling ready? Test yourself on all ${total} cards.`}
              </p>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
                <span style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-faint)", fontWeight: 600 }}>
                  Quiz type:
                </span>
                {(
                  [
                    { type: QuizType.MULTIPLE_CHOICE, label: "🔘 Multiple Choice" },
                    { type: QuizType.IDENTIFICATION, label: "✏️ Identification" },
                    { type: QuizType.MIXED, label: "🎲 Mixed" },
                  ] as const
                ).map(({ type, label }) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setDefaultQuizType(type);
                      saveDefaultQuizType(deckId, type);
                    }}
                    className={`chip${defaultQuizType === type ? " chip-active" : ""}`}
                    style={{
                      background: defaultQuizType === type ? "var(--primary)" : "var(--bg-card)",
                      color: defaultQuizType === type ? "var(--on-primary)" : "var(--text-muted)",
                      border: defaultQuizType === type ? "1.5px solid var(--primary)" : "1.5px solid var(--border)",
                      borderRadius: 8,
                      padding: "6px 14px",
                      fontSize: "calc(12px * var(--font-scale))",
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "var(--font-body, sans-serif)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <a
                href={Routes.quiz(deckId)}
                onClick={() => {
                  // Always a fresh attempt from this button, regardless of
                  // any in-progress pause — that's the top "Continue Quiz →"
                  // button's job. Clear it so the quiz page doesn't resume.
                  if (pausedQuiz) clearPausedQuiz(deckId);
                }}
                className="quiz-pill"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: "var(--primary)",
                  color: "var(--on-primary)",
                  padding: "13px 32px",
                  borderRadius: 10,
                  fontWeight: 600,
                  fontSize: "calc(15px * var(--font-scale))",
                  textDecoration: "none",
                }}
              >
                {pausedQuiz ? "🔁 Redo Quiz" : "🎯 Start Quiz"}
              </a>
            </div>
          </>
        )}

        {/* D3 — quiz history / progress */}
        {!loadingHistory && cards.length > 0 && (
          <div style={{ marginTop: 36, paddingTop: 28, borderTop: "1px solid var(--border)" }}>
            <h2
              style={{
                fontFamily: "var(--font-display, serif)",
                fontSize: "calc(18px * var(--font-scale))",
                fontWeight: 700,
                color: "var(--text)",
                marginBottom: 12,
              }}
            >
              Quiz history
            </h2>
            {history.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "calc(14px * var(--font-scale))", margin: 0 }}>
                No quizzes yet — take your first quiz and your scores will show up here.
              </p>
            ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {history.map((session) => (
                <div
                  key={session.id}
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "10px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <p style={{ fontSize: "calc(13px * var(--font-scale))", fontWeight: 600, color: "var(--text)", margin: 0 }}>
                      {session.score_percent ?? 0}% · {session.correct_count}/{session.total_questions} correct
                    </p>
                    <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", margin: "2px 0 0" }}>
                      {session.completed_at
                        ? new Date(session.completed_at).toLocaleString()
                        : ""}
                    </p>
                  </div>
                  <span
                    style={{
                      fontSize: "calc(11px * var(--font-scale))",
                      fontWeight: 600,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: "var(--text-faint)",
                      background: "rgba(196,122,46,0.12)",
                      borderRadius: 6,
                      padding: "3px 8px",
                    }}
                  >
                    {session.quiz_type.replace("_", " ")}
                  </span>
                </div>
              ))}
            </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
