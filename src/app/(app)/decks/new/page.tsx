"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { PdfUploadFlow } from "@/components/upload/PdfUploadFlow";
import { AvatarPicker } from "@/components/nav/AvatarPicker";
import { Navbar } from "@/components/nav/Navbar";
import { App, MAX_UPLOAD_SIZE_MB, Routes, SubscriptionTier } from "@/lib/contracts";
import { useAppProfile } from "../../AppProfileContext";

export default function NewDeckPage() {
  // Nav-only profile (Capycoin pill + Pro badge) from the shared (app) context.
  const { profile } = useAppProfile();

  useEffect(() => {
    document.title = `New Deck — ${App.name}`;
  }, []);

  const isPro = profile?.subscription_tier === SubscriptionTier.PRO;

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-body, sans-serif)" }}>

      {/* ── NAVBAR ── */}
      <Navbar
        backHref={Routes.dashboard}
        showWordmark={false}
        rightContent={
          <>
            <div
              title="Capycoins remaining"
              className="nav-coin-pill"
              style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--nav-bg)", border: "1.5px solid rgba(196,122,46,0.3)", borderRadius: 999, padding: "4px 12px" }}
            >
              <Image src="/capy/capycoin.png" alt="" width={18} height={18} style={{ borderRadius: "50%" }} />
              <span style={{ fontWeight: 600, color: "var(--primary-soft)", fontSize: "calc(13.6px * var(--font-scale))" }}>
                {profile?.token_balance ?? 0}<span className="nav-collapse"> Capycoins</span>
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
            <Link href={Routes.rewards} className="nav-link" style={{ color: "var(--text-faint)", textDecoration: "none", fontSize: "calc(13.6px * var(--font-scale))" }}>
              Rewards
            </Link>
            <AvatarPicker />
          </>
        }
      />

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
