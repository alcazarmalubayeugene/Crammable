"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Routes, TableNames } from "@/lib/contracts";

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

      // RLS scopes both reads to the signed-in user.
      const [{ data: profileData }, { data: deckData }] = await Promise.all([
        supabase
          .from(TableNames.profiles)
          .select("full_name, email, token_balance, subscription_tier, course")
          .eq("id", user.id)
          .single(),
        supabase
          .from(TableNames.decks)
          .select("id, title, card_count, created_at, source_filename")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      setProfile(profileData);
      setDecks((deckData ?? []) as DeckListItem[]);
      setLoading(false);
    }

    loadDashboard();
  }, []);

  async function handleLogout() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", background: "#FAF2E4", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#8A6E52", fontFamily: "var(--font-dm-sans, sans-serif)" }}>Loading…</p>
      </main>
    );
  }

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";

  return (
    <main style={{ minHeight: "100vh", background: "#FAF2E4", fontFamily: "var(--font-dm-sans, sans-serif)" }}>

      {/* ── NAVBAR ── */}
      <nav style={{ background: "#2E1A0C", borderBottom: "1px solid #4A2512", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>🦫</span>
            <span style={{ fontFamily: "var(--font-lora, serif)", fontWeight: 700, fontSize: 18, color: "#FAF2E4" }}>
              Crammable
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#4A2512", border: "1px solid rgba(196,122,46,0.3)", borderRadius: 20, padding: "5px 14px" }}>
              <span style={{ fontSize: 14 }}>🪙</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#D4954A" }}>
                {profile?.token_balance ?? 0} credits
              </span>
            </div>
            <span style={{ fontSize: 13, color: "#C49A6C" }}>
              {profile?.full_name ?? profile?.email}
            </span>
            <button
              onClick={handleLogout}
              style={{ fontSize: 13, color: "#C49A6C", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-dm-sans, sans-serif)" }}
            >
              Log out
            </button>
          </div>
        </div>
      </nav>

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px" }}>

        {/* Welcome */}
        <div style={{ marginBottom: 36 }}>
          <h1 style={{ fontFamily: "var(--font-lora, serif)", fontSize: 28, fontWeight: 700, color: "#2E1A0C", marginBottom: 6 }}>
            Welcome back, {firstName}! 👋
          </h1>
          <p style={{ color: "#8A6E52", fontSize: 15 }}>
            Ready to cram for your next exam?
          </p>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 40 }}>
          <div style={{ background: "#FFFCF7", border: "1.5px solid #E0C9A8", borderRadius: 14, padding: "20px 22px", display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 44, height: 44, background: "#FBF0E0", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🪙</div>
            <div>
              <div style={{ fontFamily: "var(--font-lora, serif)", fontSize: 26, fontWeight: 700, color: "#2E1A0C", lineHeight: 1 }}>
                {profile?.token_balance ?? 0}
              </div>
              <div style={{ fontSize: 12, color: "#8A6E52", marginTop: 3 }}>Credits remaining</div>
            </div>
          </div>

          <div style={{ background: "#FFFCF7", border: "1.5px solid #E0C9A8", borderRadius: 14, padding: "20px 22px", display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 44, height: 44, background: "#EDF5E4", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📚</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-lora, serif)", fontSize: 26, fontWeight: 700, color: "#2E1A0C", lineHeight: 1 }}>{decks.length}</div>
              <div style={{ fontSize: 12, color: "#8A6E52", marginTop: 3 }}>Active decks</div>
            </div>
            <Link href={Routes.newDeck} style={{ fontSize: 20, color: "#C47A2E", textDecoration: "none", fontWeight: 700, lineHeight: 1 }} title="Create a new deck">+</Link>
          </div>

          <div style={{ background: "#FFFCF7", border: "1.5px solid #E0C9A8", borderRadius: 14, padding: "20px 22px", display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 44, height: 44, background: "#F8EBE0", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🎯</div>
            <div>
              <div style={{ fontFamily: "var(--font-lora, serif)", fontSize: 26, fontWeight: 700, color: "#2E1A0C", lineHeight: 1 }}>
                {profile?.subscription_tier === "pro" ? "Pro" : "Free"}
              </div>
              <div style={{ fontSize: 12, color: "#8A6E52", marginTop: 3 }}>Current plan</div>
            </div>
          </div>
        </div>

        {decks.length === 0 ? (
          /* Empty state */
          <div style={{ background: "#FFFCF7", border: "1.5px dashed #E0C9A8", borderRadius: 20, padding: "60px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🦫</div>
            <h2 style={{ fontFamily: "var(--font-lora, serif)", fontSize: 20, fontWeight: 600, color: "#2E1A0C", marginBottom: 8 }}>
              No decks yet
            </h2>
            <p style={{ color: "#8A6E52", fontSize: 14, marginBottom: 28, maxWidth: 360, margin: "0 auto 28px" }}>
              Upload a PDF reviewer and Capy will turn it into a flashcard deck in seconds.
            </p>
            <Link
              href={Routes.newDeck}
              style={{ display: "inline-block", background: "#C47A2E", color: "#FAF2E4", padding: "12px 28px", borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: "none" }}
            >
              + Create your first deck
            </Link>
          </div>
        ) : (
          <>
            {/* Section header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <h2 style={{ fontFamily: "var(--font-lora, serif)", fontSize: 20, fontWeight: 700, color: "#2E1A0C" }}>
                Your decks
              </h2>
              <Link
                href={Routes.newDeck}
                style={{ display: "inline-block", background: "#C47A2E", color: "#FAF2E4", padding: "10px 20px", borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: "none" }}
              >
                + New deck
              </Link>
            </div>

            {/* Deck grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
              {decks.map((deck) => (
                <Link
                  key={deck.id}
                  href={Routes.deck(deck.id)}
                  style={{ display: "flex", flexDirection: "column", gap: 12, background: "#FFFCF7", border: "1.5px solid #E0C9A8", borderRadius: 16, padding: "20px 22px", textDecoration: "none" }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontSize: 26 }}>📚</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#C49A6C", background: "rgba(196,122,46,0.12)", borderRadius: 12, padding: "3px 10px" }}>
                      {deck.card_count} {deck.card_count === 1 ? "card" : "cards"}
                    </span>
                  </div>
                  <div>
                    <h3 style={{ fontFamily: "var(--font-lora, serif)", fontSize: 17, fontWeight: 700, color: "#2E1A0C", lineHeight: 1.35, margin: 0 }}>
                      {deck.title}
                    </h3>
                    <p style={{ fontSize: 12, color: "#8A6E52", marginTop: 6 }}>
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
