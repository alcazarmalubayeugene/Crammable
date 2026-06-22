"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ApiPaths, App, Routes, SubscriptionTier, TableNames } from "@/lib/contracts";
import { AvatarPicker } from "@/components/nav/AvatarPicker";
import { PageLoading } from "@/components/ui/PageLoading";
import { readPausedQuiz } from "@/lib/quiz/pauseState";

interface Profile {
  full_name: string | null;
  email: string;
  token_balance: number;
  subscription_tier: string;
  course: string | null;
}

interface DeckListItem {
  id: string;
  title: string;
  card_count: number;
  created_at: string;
  source_filename: string | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [decks, setDecks] = useState<DeckListItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Which deck's "⋮" menu is open — at most one at a time, closed by clicking
  // anywhere else (see the document click listener below).
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (!openMenuId) return;
    function closeMenu() {
      setOpenMenuId(null);
    }
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, [openMenuId]);

  async function handleDeleteDeck(deckId: string, title: string) {
    setOpenMenuId(null);
    if (!window.confirm(`Delete "${title}"? This can't be undone.`)) return;

    const res = await fetch(ApiPaths.deck(deckId), { method: "DELETE" });
    const json = (await res.json()) as { success: boolean; error?: { message: string } };
    if (!json.success) {
      window.alert(json.error?.message ?? "Failed to delete deck. Please try again.");
      return;
    }
    setDecks((prev) => prev.filter((d) => d.id !== deckId));
  }

  // The course onboarding step reads a name from localStorage left by the
  // name step — seed it here so jumping straight to "course" (when full_name
  // is already on the profile) doesn't bounce back to the name step.
  function goFinishProfile() {
    if (!profile?.full_name) {
      router.push("/onboarding/name");
      return;
    }
    localStorage.setItem("cm_onb_fullName", profile.full_name);
    router.push("/onboarding/course");
  }

  useEffect(() => {
    async function loadDashboard() {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = Routes.login;
        return;
      }

      // Profile stays a direct (RLS-scoped) read — there is no profile API route.
      // Decks now come from GET /api/decks (cookie-auth) instead of a direct query.
      const [{ data: profileData }, decksRes] = await Promise.all([
        supabase
          .from(TableNames.profiles)
          .select("full_name, email, token_balance, subscription_tier, course")
          .eq("id", user.id)
          .single(),
        fetch(ApiPaths.decks),
      ]);

      const decksJson = (await decksRes.json()) as {
        success: boolean;
        decks?: DeckListItem[];
      };

      // Fresh signups land here right after email confirmation — if they never
      // finished the one-question-at-a-time /onboarding/* flow, send them
      // there instead of showing the dashboard. The flag is cleared once that
      // flow completes (or is skipped), so this never fires again afterward.
      if (
        localStorage.getItem("cm_pending_onboarding") === "1" &&
        (!profileData?.full_name || !profileData?.course)
      ) {
        window.location.href = "/onboarding/name";
        return;
      }

      setProfile(profileData);
      setDecks(decksJson.success && decksJson.decks ? decksJson.decks : []);
      setLoading(false);
    }

    loadDashboard();
  }, []);

  async function handleLogout() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = Routes.home;
  }

  if (loading) {
    return <PageLoading />;
  }

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const isPro = profile?.subscription_tier === SubscriptionTier.PRO;
  // Catches accounts that never finished the name/course onboarding steps —
  // not just fresh signups going through it for the first time.
  const isProfileIncomplete = !profile?.full_name || !profile?.course;
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-body, sans-serif)" }}>

      {/* ── NAVBAR ── */}
      <nav style={{ background: "var(--nav-bg)", borderBottom: "1px solid var(--nav-border)", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: "100%", margin: "0 auto", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "var(--font-display, serif)", fontWeight: 600, fontSize: "calc(16px * var(--font-scale))", color: "var(--nav-text)" }}>
              {App.name}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: "calc(13.6px * var(--font-scale))" }}>
            {/* Capycoin balance — status display only (the doc's "remaining"); the
                "earn-more link" is the Rewards item beside it + the Capycoins card. */}
            <div
              title="Capycoins remaining"
              style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--nav-bg)", border: "1.5px solid rgba(196,122,46,0.3)", borderRadius: 999, padding: "4px 12px" }}
            >
              <Image src="/capy/capycoin.png" alt="" width={18} height={18} style={{ borderRadius: "50%" }} />
              <span style={{ fontWeight: 600, color: "var(--primary-soft)" }}>
                {profile?.token_balance ?? 0} Capycoins
              </span>
            </div>
            {isPro && (
              <span style={{ background: "var(--primary)", color: "var(--on-primary)", borderRadius: 999, padding: "4px 10px", fontSize: "calc(12.5px * var(--font-scale))", fontWeight: 600 }}>
                Pro ✦
              </span>
            )}
            <Link href={Routes.rewards} className="nav-link" style={{ color: "var(--text-faint)", textDecoration: "none" }}>
              Rewards
            </Link>
            <Link href={Routes.settings} className="nav-link" style={{ color: "var(--text-faint)", textDecoration: "none" }}>
              Settings
            </Link>
            <AvatarPicker />
            <span style={{ color: "var(--text-faint)" }}>
              {profile?.email}
            </span>
            <button
              onClick={handleLogout}
              className="nav-link"
              style={{ color: "var(--text-faint)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body, sans-serif)", fontSize: "inherit" }}
            >
              Log out
            </button>
          </div>
        </div>
      </nav>

      {/* Floating to-do checklist — fixed to the right edge of the viewport,
          listing exactly which profile fields are still missing. */}
      {isProfileIncomplete && (
        <div
          style={{
            position: "fixed",
            right: 16,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 60,
            width: 200,
            background: "var(--bg-card)",
            border: "1.5px solid var(--error)",
            borderRadius: 14,
            padding: 16,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            fontFamily: "var(--font-body, sans-serif)",
          }}
        >
          <p style={{ margin: 0, marginBottom: 10, fontWeight: 700, fontSize: "calc(13px * var(--font-scale))", color: "var(--error-dark)" }}>
            ⚠ Finish your profile
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, marginBottom: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            <li style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "calc(13px * var(--font-scale))", color: profile?.full_name ? "var(--text-faint)" : "var(--text)", textDecoration: profile?.full_name ? "line-through" : "none" }}>
              <span>{profile?.full_name ? "✓" : "☐"}</span> Full name
            </li>
            <li style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "calc(13px * var(--font-scale))", color: profile?.course ? "var(--text-faint)" : "var(--text)", textDecoration: profile?.course ? "line-through" : "none" }}>
              <span>{profile?.course ? "✓" : "☐"}</span> Course / Program
            </li>
          </ul>
          <button
            type="button"
            onClick={goFinishProfile}
            style={{ display: "block", width: "100%", textAlign: "center", background: "var(--error)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 0", fontWeight: 600, fontSize: "calc(12.5px * var(--font-scale))", cursor: "pointer", fontFamily: "var(--font-body, sans-serif)" }}
          >
            Finish now →
          </button>
        </div>
      )}

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px" }}>

        {/* Welcome */}
        <div className="anim-fade-up" style={{ marginBottom: 36 }}>
          <h1 style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(20px * var(--font-scale))", fontWeight: 400, color: "var(--text)", marginBottom: 2 }}>
            {timeGreeting}, {firstName}
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "calc(15px * var(--font-scale))", margin: 0 }}>
            — <em style={{ color: "var(--primary)", fontStyle: "italic", fontWeight: 600 }}>Capy</em> kept your decks warm ☕
          </p>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 40 }}>
          <Link href={Routes.rewards} className="anim-fade-up-1 hover-lift" style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: 14, padding: "16px", display: "flex", alignItems: "center", gap: 16, textDecoration: "none" }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, overflow: "hidden" }}>
              <Image src="/capy/capycoin.png" alt="" width={44} height={44} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(26px * var(--font-scale))", fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>
                {profile?.token_balance ?? 0}
              </div>
              <div style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", marginTop: 3 }}>Capycoins remaining</div>
            </div>
            <span style={{ fontSize: "calc(12px * var(--font-scale))", fontWeight: 600, color: "var(--primary)", whiteSpace: "nowrap" }}>Earn more →</span>
          </Link>

          <div className="anim-fade-up-2 hover-lift" style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: 14, padding: "16px", display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 44, height: 44, background: "var(--success-bg)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "calc(22px * var(--font-scale))" }}>📚</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(26px * var(--font-scale))", fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>{decks.length}</div>
              <div style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", marginTop: 3 }}>Active decks</div>
            </div>
            <Link href={Routes.newDeck} style={{ fontSize: "calc(20px * var(--font-scale))", color: "var(--primary)", textDecoration: "none", fontWeight: 700, lineHeight: 1 }} title="Create a new deck">+</Link>
          </div>

          {isPro ? (
            <div className="anim-fade-up-3 hover-lift" style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: 14, padding: "16px", display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 44, height: 44, background: "var(--bg-subtle)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "calc(22px * var(--font-scale))" }}>🎯</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(26px * var(--font-scale))", fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>
                  Pro
                </div>
                <div style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", marginTop: 3 }}>Current plan</div>
              </div>
            </div>
          ) : (
            <Link href={Routes.upgrade} className="anim-fade-up-3 hover-lift" style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: 14, padding: "16px", display: "flex", alignItems: "center", gap: 16, textDecoration: "none" }}>
              <div style={{ width: 44, height: 44, background: "var(--bg-subtle)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "calc(22px * var(--font-scale))" }}>🎯</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(26px * var(--font-scale))", fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>
                  Free
                </div>
                <div style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", marginTop: 3 }}>Current plan</div>
              </div>
              <span style={{ fontSize: "calc(12px * var(--font-scale))", fontWeight: 600, color: "var(--primary)", whiteSpace: "nowrap" }}>Upgrade →</span>
            </Link>
          )}
        </div>

        {decks.length === 0 ? (
          /* Empty state */
          <div className="anim-fade-up-3" style={{ background: "var(--bg-card)", border: "1.5px dashed var(--border)", borderRadius: 20, padding: "60px 24px", textAlign: "center" }}>
            <h2 style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(20px * var(--font-scale))", fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
              No decks yet
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "calc(14px * var(--font-scale))", marginBottom: 28, maxWidth: 360, margin: "0 auto 28px" }}>
              Upload a PDF reviewer and Capy will turn it into a flashcard deck in seconds.
            </p>
            <Link
              href={Routes.newDeck}
              style={{ display: "inline-block", background: "var(--primary)", color: "var(--nav-text)", padding: "12px 28px", borderRadius: 10, fontWeight: 600, fontSize: "calc(14px * var(--font-scale))", textDecoration: "none" }}
            >
              + Create your first deck
            </Link>
          </div>
        ) : (
          <>
            {/* Deck grid — concept's "+ New deck" tile + per-card "Quiz me" button,
                layered on top of the card_count/date info the concept doesn't show. */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
              <Link
                href={Routes.newDeck}
                className="anim-fade-up hover-lift"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 96,
                  border: "1.5px dashed var(--border)",
                  borderRadius: 16,
                  background: "var(--bg-subtle)",
                  color: "var(--text-muted)",
                  fontWeight: 600,
                  fontSize: "calc(14px * var(--font-scale))",
                  textDecoration: "none",
                }}
              >
                ＋ New deck
              </Link>
              {decks.map((deck, i) => {
                const paused = readPausedQuiz(deck.id);
                return (
                  <div
                    key={deck.id}
                    onClick={() => router.push(Routes.deck(deck.id))}
                    className="anim-fade-up hover-lift"
                    style={{
                      position: "relative",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      background: "var(--bg-card)",
                      border: "1.5px solid var(--border)",
                      borderRadius: 16,
                      padding: "20px 22px",
                      cursor: "pointer",
                      animationDelay: `${0.24 + i * 0.05}s`,
                    }}
                  >
                    {/* "⋮" menu — Edit (reuses the deck detail page's existing
                        rename/card editing) and Delete. Stops propagation so it
                        never also triggers the card's own navigate-to-deck click. */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === deck.id ? null : deck.id);
                      }}
                      className="icon-btn"
                      style={{
                        position:     "absolute",
                        top:          12,
                        right:        12,
                        background:   "transparent",
                        border:       "none",
                        color:        "var(--text-faint)",
                        fontSize:     "calc(18px * var(--font-scale))",
                        lineHeight:   1,
                        cursor:       "pointer",
                        padding:      "4px 8px",
                        borderRadius: 8,
                      }}
                      aria-label="Deck options"
                    >
                      ⋮
                    </button>
                    {openMenuId === deck.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="anim-pop"
                        style={{
                          position:     "absolute",
                          top:          40,
                          right:        12,
                          background:   "var(--bg-card)",
                          border:       "1.5px solid var(--border)",
                          borderRadius: 10,
                          boxShadow:    "0 4px 16px rgba(0,0,0,0.12)",
                          overflow:     "hidden",
                          zIndex:       10,
                          minWidth:     140,
                        }}
                      >
                        <Link
                          href={Routes.deck(deck.id)}
                          onClick={() => setOpenMenuId(null)}
                          className="menu-item"
                          style={{
                            display:    "block",
                            padding:    "10px 16px",
                            fontSize:   "calc(13px * var(--font-scale))",
                            color:      "var(--text)",
                            textDecoration: "none",
                            fontFamily: "var(--font-body, sans-serif)",
                          }}
                        >
                          ✎ Edit
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDeleteDeck(deck.id, deck.title)}
                          className="menu-item menu-item-danger"
                          style={{
                            display:      "block",
                            width:        "100%",
                            textAlign:    "left",
                            padding:      "10px 16px",
                            fontSize:     "calc(13px * var(--font-scale))",
                            color:        "var(--error-dark)",
                            background:   "transparent",
                            border:       "none",
                            borderTop:    "1px solid var(--border)",
                            cursor:       "pointer",
                            fontFamily:   "var(--font-body, sans-serif)",
                          }}
                        >
                          🗑 Delete
                        </button>
                      </div>
                    )}

                    <h3 style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(17px * var(--font-scale))", fontWeight: 700, color: "var(--text)", lineHeight: 1.35, margin: 0, paddingRight: 24 }}>
                      {deck.title}
                    </h3>
                    <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", margin: 0 }}>
                      {deck.card_count} {deck.card_count === 1 ? "card" : "cards"} · edited{" "}
                      {new Date(deck.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                    </p>
                    <Link
                      href={Routes.quiz(deck.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="btn-solid quiz-pill"
                      style={{
                        alignSelf: "flex-start",
                        marginTop: 4,
                        background: "var(--primary)",
                        color: "var(--on-primary)",
                        borderRadius: 8,
                        padding: "7px 18px",
                        fontSize: "calc(13px * var(--font-scale))",
                        fontWeight: 600,
                        textDecoration: "none",
                      }}
                    >
                      {paused ? `Continue: Question ${paused.currentIdx + 1} of ${paused.questions.length}` : "Quiz me"}
                    </Link>
                  </div>
                );
              })}
            </div>
          </>
        )}

      </div>
    </main>
  );
}
