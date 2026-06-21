"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ApiPaths, App, Routes, SubscriptionTier, TableNames } from "@/lib/contracts";

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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [decks, setDecks] = useState<DeckListItem[]>([]);
  const [loading, setLoading] = useState(true);

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
    return (
      <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-body, sans-serif)" }}>Loading…</p>
      </main>
    );
  }

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const isPro = profile?.subscription_tier === SubscriptionTier.PRO;

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-body, sans-serif)" }}>

      {/* ── NAVBAR ── */}
      <nav style={{ background: "var(--nav-bg)", borderBottom: "1px solid var(--nav-border)", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: "100%", margin: "0 auto", padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src="/capy/capy-idle.svg" alt="" width={29} height={24} style={{ height: "calc(24px * var(--font-scale))", width: "auto" }} />
            <span style={{ fontFamily: "var(--font-display, serif)", fontWeight: 700, fontSize: "calc(18px * var(--font-scale))", color: "var(--nav-text)" }}>
              {App.name}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* Capycoin balance — status display only (the doc's "remaining"); the
                "earn-more link" is the Rewards item beside it + the Capycoins card. */}
            <div
              title="Capycoins remaining"
              style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--nav-bg)", border: "1px solid rgba(196,122,46,0.3)", borderRadius: 20, padding: "5px 14px" }}
            >
              <Image src="/capy/capycoin.png" alt="" width={32} height={32} style={{ borderRadius: "50%" }} />
              <span style={{ fontSize: "calc(13px * var(--font-scale))", fontWeight: 600, color: "var(--primary-soft)" }}>
                {profile?.token_balance ?? 0} Capycoins
              </span>
            </div>
            <Link href={Routes.rewards} className="nav-link" style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-faint)", textDecoration: "none" }}>
              Rewards
            </Link>
            <Link href={Routes.settings} className="nav-link" style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-faint)", textDecoration: "none" }}>
              Settings
            </Link>
            <span style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-faint)" }}>
              {profile?.email}
            </span>
            <button
              onClick={handleLogout}
              className="nav-link"
              style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-faint)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body, sans-serif)" }}
            >
              Log out
            </button>
          </div>
        </div>
      </nav>

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px" }}>

        {/* Welcome */}
        <div className="anim-fade-up" style={{ marginBottom: 36 }}>
          <h1 style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(28px * var(--font-scale))", fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
            Welcome back, {firstName}! <span className="wave">👋</span>
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "calc(15px * var(--font-scale))" }}>
            Ready to cram for your next exam?
          </p>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 40 }}>
          <Link href={Routes.rewards} className="anim-fade-up-1 hover-lift" style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: 14, padding: "20px 22px", display: "flex", alignItems: "center", gap: 16, textDecoration: "none" }}>
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

          <div className="anim-fade-up-2 hover-lift" style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: 14, padding: "20px 22px", display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 44, height: 44, background: "var(--success-bg)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "calc(22px * var(--font-scale))" }}>📚</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(26px * var(--font-scale))", fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>{decks.length}</div>
              <div style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", marginTop: 3 }}>Active decks</div>
            </div>
            <Link href={Routes.newDeck} style={{ fontSize: "calc(20px * var(--font-scale))", color: "var(--primary)", textDecoration: "none", fontWeight: 700, lineHeight: 1 }} title="Create a new deck">+</Link>
          </div>

          {isPro ? (
            <div className="anim-fade-up-3 hover-lift" style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: 14, padding: "20px 22px", display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 44, height: 44, background: "var(--bg-subtle)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "calc(22px * var(--font-scale))" }}>🎯</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(26px * var(--font-scale))", fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>
                  Pro
                </div>
                <div style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", marginTop: 3 }}>Current plan</div>
              </div>
            </div>
          ) : (
            <Link href={Routes.upgrade} className="anim-fade-up-3 hover-lift" style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: 14, padding: "20px 22px", display: "flex", alignItems: "center", gap: 16, textDecoration: "none" }}>
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
            <img src="/capy/capy-idle.svg" alt="" width={68} height={56} style={{ height: "calc(56px * var(--font-scale))", width: "auto", marginBottom: 16 }} />
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
            {/* Section header */}
            <div className="anim-fade-up-3" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <h2 style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(20px * var(--font-scale))", fontWeight: 700, color: "var(--text)" }}>
                Your decks
              </h2>
              <Link
                href={Routes.newDeck}
                className="hover-lift"
                style={{ display: "inline-block", background: "var(--primary)", color: "var(--nav-text)", padding: "10px 20px", borderRadius: 10, fontWeight: 600, fontSize: "calc(14px * var(--font-scale))", textDecoration: "none" }}
              >
                + New deck
              </Link>
            </div>

            {/* Deck grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
              {decks.map((deck, i) => (
                <Link
                  key={deck.id}
                  href={Routes.deck(deck.id)}
                  className="anim-fade-up hover-lift"
                  style={{ display: "flex", flexDirection: "column", gap: 12, background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: 16, padding: "20px 22px", textDecoration: "none", animationDelay: `${0.24 + i * 0.05}s` }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontSize: "calc(26px * var(--font-scale))" }}>📚</span>
                    <span style={{ fontSize: "calc(12px * var(--font-scale))", fontWeight: 600, color: "var(--text-faint)", background: "rgba(196,122,46,0.12)", borderRadius: 12, padding: "3px 10px" }}>
                      {deck.card_count} {deck.card_count === 1 ? "card" : "cards"}
                    </span>
                  </div>
                  <div>
                    <h3 style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(17px * var(--font-scale))", fontWeight: 700, color: "var(--text)", lineHeight: 1.35, margin: 0 }}>
                      {deck.title}
                    </h3>
                    <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", marginTop: 6 }}>
                      {new Date(deck.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}

      </div>
    </main>
  );
}
