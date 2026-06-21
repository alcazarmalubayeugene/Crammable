"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { PdfUploadFlow } from "@/components/upload/PdfUploadFlow";
import { AvatarPicker } from "@/components/nav/AvatarPicker";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { App, MAX_UPLOAD_SIZE_MB, Routes, SubscriptionTier, TableNames } from "@/lib/contracts";

interface NavProfile {
  token_balance: number;
  subscription_tier: string;
}

export default function NewDeckPage() {
  const [profile, setProfile] = useState<NavProfile | null>(null);

  // Nav-only profile read (Capycoin pill + Pro badge) — mirrors the dashboard's
  // direct, RLS-scoped Supabase read. Independent of PdfUploadFlow's own
  // internal consent/tier fetch, which serves a different purpose.
  useEffect(() => {
    document.title = `New Deck — ${App.name}`;
  }, []);

  useEffect(() => {
    async function loadNavProfile() {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from(TableNames.profiles)
        .select("token_balance, subscription_tier")
        .eq("id", user.id)
        .single();
      setProfile(data);
    }
    loadNavProfile();
  }, []);

  const isPro = profile?.subscription_tier === SubscriptionTier.PRO;

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-body, sans-serif)" }}>

      {/* ── NAVBAR ── */}
      <nav style={{ background: "var(--nav-bg)", borderBottom: "1px solid var(--nav-border)", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: "100%", margin: "0 auto", padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <a href={Routes.dashboard} className="nav-link" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
              <span style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--text-faint)" }}>← Back</span>
            </a>
            <span style={{ color: "var(--nav-border)", margin: "0 8px" }}>|</span>
            <Image src="/capy/capy-hero.png" alt="" width={29} height={29} style={{ height: "calc(28px * var(--font-scale))", width: "auto", borderRadius: 6 }} />
            <span style={{ fontFamily: "var(--font-display, serif)", fontWeight: 700, fontSize: "calc(18px * var(--font-scale))", color: "var(--nav-text)" }}>
              {App.name}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--primary)", fontWeight: 700 }}>New Deck</span>
            <div
              title="Capycoins remaining"
              style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--nav-bg)", border: "1px solid rgba(196,122,46,0.3)", borderRadius: 20, padding: "5px 14px" }}
            >
              <Image src="/capy/capycoin.png" alt="" width={20} height={20} style={{ borderRadius: "50%" }} />
              <span style={{ fontSize: "calc(13px * var(--font-scale))", fontWeight: 600, color: "var(--primary-soft)" }}>
                {profile?.token_balance ?? 0} Capycoins
              </span>
            </div>
            {isPro && (
              <span style={{ background: "var(--primary)", color: "var(--on-primary)", borderRadius: 999, padding: "4px 10px", fontSize: "calc(12px * var(--font-scale))", fontWeight: 600 }}>
                Pro ✦
              </span>
            )}
            <AvatarPicker />
          </div>
        </div>
      </nav>

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px" }}>

        {/* Page header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(28px * var(--font-scale))", fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
            Create a new deck
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "calc(15px * var(--font-scale))", lineHeight: 1.6 }}>
            Upload a PDF reviewer and Capy will turn it into flashcards in seconds.
            Max {MAX_UPLOAD_SIZE_MB} MB per file.
          </p>
        </div>

        {/* Upload card */}
        <div style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: 20, padding: "32px" }}>
          <PdfUploadFlow />
        </div>

        {/* Disclaimer */}
        <p style={{ marginTop: 20, fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", textAlign: "center", lineHeight: 1.6 }}>
          {App.tagline} AI-generated content may contain errors — always verify against your official course materials.
        </p>

      </div>
    </main>
  );
}
