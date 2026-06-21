"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { authHeaders } from "@/lib/api/auth-headers";
import {
  ApiPaths,
  App,
  GenerationMode,
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

  function goTo(idx: number) {
    setCurrentIdx(idx);
    setIsFlipped(false);
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

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "var(--bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-body, sans-serif)" }}>
          Loading…
        </p>
      </main>
    );
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
      <nav
        style={{
          background: "var(--nav-bg)",
          borderBottom: "1px solid var(--nav-border)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          style={{
            maxWidth: "100%",
            margin: "0 auto",
            padding: "0 24px",
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <a
              href={Routes.dashboard}
              className="nav-link"
              style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}
            >
              <span style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--text-faint)" }}>← Back</span>
            </a>
            <span style={{ color: "var(--nav-border)", margin: "0 8px" }}>|</span>
            <img src="/capy/capy-idle.svg" alt="" width={29} height={24} style={{ height: "calc(24px * var(--font-scale))", width: "auto" }} />
            <span
              style={{
                fontFamily: "var(--font-display, serif)",
                fontWeight: 700,
                fontSize: "calc(18px * var(--font-scale))",
                color: "var(--nav-text)",
              }}
            >
              {App.name}
            </span>
          </div>

          {profile && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "var(--nav-bg)",
                  border: "1px solid rgba(196,122,46,0.3)",
                  borderRadius: 20,
                  padding: "5px 14px",
                }}
              >
                <Image src="/capy/capycoin.png" alt="" width={32} height={32} style={{ borderRadius: "50%" }} />
                <span style={{ fontSize: "calc(13px * var(--font-scale))", fontWeight: 600, color: "var(--primary-soft)" }}>
                  {profile.token_balance} Capycoins
                </span>
              </div>
              {profile.full_name && (
                <span style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-faint)" }}>
                  {profile.full_name.split(" ")[0]}
                </span>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px" }}>

        {/* Deck header */}
        <div style={{ marginBottom: 24 }}>
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
                  )}
                  <a
                    href={Routes.quiz(deckId)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      background: "var(--primary)",
                      color: "var(--nav-text)",
                      padding: "11px 24px",
                      borderRadius: 10,
                      fontWeight: 600,
                      fontSize: "calc(14px * var(--font-scale))",
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Start Quiz →
                  </a>
                </>
              )}
              <button
                onClick={handleDelete}
                disabled={deleting}
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
            style={{
              background: "var(--bg-card)",
              border: "1.5px solid var(--border)",
              borderRadius: 10,
              padding: "14px 16px",
              marginBottom: 16,
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
                style={{
                  background: deck.is_public ? "var(--bg-card)" : "var(--primary)",
                  border: deck.is_public ? "1.5px solid var(--border)" : "none",
                  color: deck.is_public ? "var(--text-muted)" : "var(--nav-text)",
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
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 28,
          }}
        >
          <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", lineHeight: 1.6, margin: 0 }}>
            ⚠️ {UIMessages.aiDisclaimer}
          </p>
        </div>

        {/* D1 — card management toolbar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          {total > 0 ? (
            <button
              type="button"
              onClick={toggleStudyWeakMode}
              style={{
                background: studyWeakMode ? "var(--primary)" : "var(--bg-card)",
                border: "1.5px solid var(--border)",
                color: studyWeakMode ? "var(--nav-text)" : "var(--text)",
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
            <span />
          )}
          <button
            type="button"
            onClick={() => {
              setAddingCard((a) => !a);
              setAddCardError("");
            }}
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
                      style={{ background: "none", border: "none", color: "var(--primary)", fontSize: "calc(12px * var(--font-scale))", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body, sans-serif)" }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={deleteCurrentCard}
                      disabled={deletingCard}
                      style={{ background: "none", border: "none", color: "var(--error-dark)", fontSize: "calc(12px * var(--font-scale))", fontWeight: 600, cursor: deletingCard ? "not-allowed" : "pointer", fontFamily: "var(--font-body, sans-serif)" }}
                    >
                      {deletingCard ? "Deleting…" : "Delete"}
                    </button>
                  </>
                )}
                <span style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-faint)" }}>
                  {editingCard ? "Editing card" : "Click card to flip"}
                </span>
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

              {/* Dot indicators (max 12 shown) */}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {cards.slice(0, Math.min(total, 12)).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goTo(i)}
                    style={{
                      width: i === currentIdx ? 20 : 8,
                      height: 8,
                      borderRadius: 4,
                      background: i === currentIdx ? "var(--primary)" : "var(--border)",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                    aria-label={`Go to card ${i + 1}`}
                  />
                ))}
                {total > 12 && (
                  <span style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", marginLeft: 2 }}>
                    +{total - 12}
                  </span>
                )}
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
                Feeling ready? Test yourself on all {total} cards.
              </p>
              <a
                href={Routes.quiz(deckId)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: "var(--primary)",
                  color: "var(--nav-text)",
                  padding: "13px 32px",
                  borderRadius: 10,
                  fontWeight: 600,
                  fontSize: "calc(15px * var(--font-scale))",
                  textDecoration: "none",
                }}
              >
                🎯 Start Quiz
              </a>
            </div>
          </>
        )}

        {/* D3 — quiz history / progress */}
        {!loadingHistory && history.length > 0 && (
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
          </div>
        )}
      </div>
    </main>
  );
}
