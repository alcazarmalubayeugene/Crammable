"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  ApiPaths,
  App,
  Routes,
  UIMessages,
  type Deck,
  type Flashcard,
} from "@/lib/contracts";

/**
 * Read-only public deck viewer (B5) — no auth required. Fetches via
 * GET /api/public/decks/[id], which is backed by the "anyone read public" RLS
 * policies (schema §5). No quiz, no edit — just browse the cards.
 */
export default function PublicDeckPage() {
  const params = useParams();
  const deckId = Array.isArray(params.id) ? params.id[0] : (params.id as string);

  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setError("Taking too long to load. Check your connection and refresh.");
      setLoading(false);
    }, 10_000);

    async function load() {
      try {
        const res = await fetch(ApiPaths.publicDeck(deckId));
        const data = (await res.json()) as {
          success: boolean;
          deck?: Deck;
          cards?: Flashcard[];
          error?: { message: string };
        };

        if (!data.success || !data.deck) {
          setError("This deck isn't public, or it doesn't exist.");
          setLoading(false);
          return;
        }

        setDeck(data.deck);
        setCards(data.cards ?? []);
        setLoading(false);
      } catch {
        setError("Failed to load deck. Check your connection and try again.");
        setLoading(false);
      } finally {
        clearTimeout(timeout);
      }
    }
    load();
    return () => clearTimeout(timeout);
  }, [deckId]);

  function goTo(idx: number) {
    setCurrentIdx(idx);
    setIsFlipped(false);
  }

  const card = cards[currentIdx] ?? null;
  const total = cards.length;

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#FAF2E4",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ color: "#8A6E52", fontFamily: "var(--font-dm-sans, sans-serif)" }}>
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
          background: "#FAF2E4",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          fontFamily: "var(--font-dm-sans, sans-serif)",
        }}
      >
        <span style={{ fontSize: 48 }}>🦫</span>
        <p style={{ color: "#8A6E52", fontSize: 15 }}>{error || "Deck not found."}</p>
        <a
          href={Routes.home}
          style={{ color: "#C47A2E", textDecoration: "none", fontWeight: 600, fontSize: 14 }}
        >
          ← Back to {App.name}
        </a>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#FAF2E4",
        fontFamily: "var(--font-dm-sans, sans-serif)",
      }}
    >
      {/* ── NAVBAR ── */}
      <nav
        style={{
          background: "#2E1A0C",
          borderBottom: "1px solid #4A2512",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 24px",
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <a
            href={Routes.home}
            style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}
          >
            <span style={{ fontSize: 24 }}>🦫</span>
            <span
              style={{
                fontFamily: "var(--font-lora, serif)",
                fontWeight: 700,
                fontSize: 18,
                color: "#FAF2E4",
              }}
            >
              {App.name}
            </span>
          </a>
          <span style={{ fontSize: 13, color: "#C49A6C" }}>Shared deck</span>
        </div>
      </nav>

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px" }}>
        {/* Deck header */}
        <div style={{ marginBottom: 24 }}>
          <h1
            style={{
              fontFamily: "var(--font-lora, serif)",
              fontSize: 28,
              fontWeight: 700,
              color: "#2E1A0C",
              marginBottom: 6,
              lineHeight: 1.25,
            }}
          >
            {deck.title}
          </h1>
          <span style={{ fontSize: 13, color: "#8A6E52" }}>
            {total} {total === 1 ? "card" : "cards"} · shared by a {App.name} user
          </span>
        </div>

        {/* AI disclaimer — required on every generated deck page */}
        <div
          style={{
            background: "#FFFCF7",
            border: "1px solid #E0C9A8",
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 28,
          }}
        >
          <p style={{ fontSize: 12, color: "#8A6E52", lineHeight: 1.6, margin: 0 }}>
            ⚠️ {UIMessages.aiDisclaimer}
          </p>
        </div>

        {/* Flashcard viewer */}
        {total === 0 ? (
          <div
            style={{
              background: "#FFFCF7",
              border: "1.5px dashed #E0C9A8",
              borderRadius: 20,
              padding: "60px 24px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <p style={{ color: "#8A6E52", fontSize: 15 }}>This deck has no cards yet.</p>
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
              }}
            >
              <span style={{ fontSize: 13, color: "#8A6E52" }}>
                Card {currentIdx + 1} of {total}
              </span>
              <span style={{ fontSize: 12, color: "#C49A6C" }}>Click card to flip</span>
            </div>

            {/* Progress bar */}
            <div
              style={{
                height: 4,
                background: "#E0C9A8",
                borderRadius: 4,
                marginBottom: 20,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  background: "#C47A2E",
                  borderRadius: 4,
                  width: `${((currentIdx + 1) / total) * 100}%`,
                  transition: "width 0.3s",
                }}
              />
            </div>

            {/* Flip card */}
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
                    background: "#FFFCF7",
                    border: "1.5px solid #E0C9A8",
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
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      color: "#C49A6C",
                      textTransform: "uppercase",
                      marginBottom: 16,
                    }}
                  >
                    Front
                  </span>
                  <p
                    style={{
                      fontFamily: "var(--font-lora, serif)",
                      fontSize: 20,
                      fontWeight: 600,
                      color: "#2E1A0C",
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
                    background: "#4A2512",
                    border: "1.5px solid #C47A2E",
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
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      color: "#C49A6C",
                      textTransform: "uppercase",
                      marginBottom: 16,
                    }}
                  >
                    Back
                  </span>
                  <p
                    style={{
                      fontFamily: "var(--font-lora, serif)",
                      fontSize: 18,
                      fontWeight: 500,
                      color: "#FAF2E4",
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
                            fontSize: 11,
                            color: "#C49A6C",
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
                  border: "1.5px solid #E0C9A8",
                  background: "#FFFCF7",
                  color: "#2E1A0C",
                  fontSize: 18,
                  cursor: currentIdx === 0 ? "not-allowed" : "pointer",
                  opacity: currentIdx === 0 ? 0.35 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-dm-sans, sans-serif)",
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
                      background: i === currentIdx ? "#C47A2E" : "#E0C9A8",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                    aria-label={`Go to card ${i + 1}`}
                  />
                ))}
                {total > 12 && (
                  <span style={{ fontSize: 12, color: "#8A6E52", marginLeft: 2 }}>
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
                  border: "1.5px solid #E0C9A8",
                  background: "#FFFCF7",
                  color: "#2E1A0C",
                  fontSize: 18,
                  cursor: currentIdx === total - 1 ? "not-allowed" : "pointer",
                  opacity: currentIdx === total - 1 ? 0.35 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-dm-sans, sans-serif)",
                }}
                aria-label="Next card"
              >
                →
              </button>
            </div>

            {/* Sign-up CTA — bottom */}
            <div style={{ textAlign: "center", marginTop: 36, paddingTop: 28, borderTop: "1px solid #E0C9A8" }}>
              <p style={{ fontSize: 14, color: "#8A6E52", marginBottom: 14 }}>
                Want to make your own flashcards from your notes?
              </p>
              <a
                href={Routes.signup}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: "#C47A2E",
                  color: "#FAF2E4",
                  padding: "13px 32px",
                  borderRadius: 10,
                  fontWeight: 600,
                  fontSize: 15,
                  textDecoration: "none",
                }}
              >
                Try {App.name} →
              </a>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
