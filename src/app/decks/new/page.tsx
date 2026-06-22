"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
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
        <div style={{ maxWidth: "100%", margin: "0 auto", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <a href={Routes.dashboard} className="nav-link" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
              <span style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-faint)" }}>← Back</span>
            </a>
            <span style={{ color: "var(--nav-border)" }}>|</span>
            <span style={{ fontFamily: "var(--font-display, serif)", fontWeight: 600, fontSize: "calc(16px * var(--font-scale))", color: "var(--nav-text)" }}>
              {App.name}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: "calc(13.6px * var(--font-scale))" }}>
            <div
              title="Capycoins remaining"
              style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--nav-bg)", border: "1.5px solid rgba(196,122,46,0.3)", borderRadius: 999, padding: "4px 12px" }}
            >
              <Image src="/capy/capycoin.png" alt="" width={18} height={18} style={{ borderRadius: "50%" }} />
              <span style={{ fontWeight: 600, color: "var(--primary-soft)" }}>
                {profile?.token_balance ?? 0} Capycoins
              </span>
            </div>
            {isPro ? (
              <span style={{ background: "var(--primary)", color: "var(--on-primary)", borderRadius: 999, padding: "4px 10px", fontSize: "calc(12.5px * var(--font-scale))", fontWeight: 600 }}>
                Pro ✦
              </span>
            ) : (
              <Link
                href={Routes.upgrade}
                className="hover-lift"
                style={{ background: "var(--primary)", color: "var(--on-primary)", borderRadius: 999, padding: "4px 10px", fontSize: "calc(12.5px * var(--font-scale))", fontWeight: 600, textDecoration: "none" }}
              >
                Upgrade ✦
              </Link>
            )}
            <Link href={Routes.rewards} className="nav-link" style={{ color: "var(--text-faint)", textDecoration: "none" }}>
              Rewards
            </Link>
            <Link href={Routes.settings} className="nav-link" style={{ color: "var(--text-faint)", textDecoration: "none" }}>
              Settings
            </Link>
            <AvatarPicker />
          </div>
        </div>
      </nav>

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "22px 24px" }}>

        {/* Page header */}
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(24px * var(--font-scale))", fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
            New deck
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "calc(14px * var(--font-scale))", lineHeight: 1.5 }}>
            <em style={{ color: "var(--primary)", fontStyle: "italic", marginRight: 4 }}>Capy</em> will turn your
            notes into flashcards ✦ &nbsp;Max {MAX_UPLOAD_SIZE_MB} MB per file.
          </p>
        </div>

        <PdfUploadFlow />

        {/* Disclaimer */}
        <p style={{ marginTop: 14, fontSize: "calc(11px * var(--font-scale))", color: "var(--text-muted)", textAlign: "center", lineHeight: 1.5 }}>
          {App.tagline} AI-generated content may contain errors — always verify against your official course materials.
        </p>

      </div>
    </main>
  );
}
