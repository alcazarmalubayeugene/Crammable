"use client";

import { useState } from "react";
import { App, Routes, UIMessages } from "@/lib/contracts";
import { Navbar } from "@/components/nav/Navbar";

const cardStyle = {
  background: "var(--bg-card)",
  border: "1.5px solid var(--border)",
  borderRadius: 16,
  padding: "20px 22px",
  marginBottom: 16,
} as const;

const FAQS = [
  {
    q: "Is my document sent anywhere?",
    a: "Only after you check the AI consent box. Your document's text goes to our AI provider to generate flashcards — the file itself is deleted right after extraction, and we never send your profile info, just the document text.",
  },
  {
    q: "What's the difference between Free and Pro?",
    a: "Free gives you 3 decks, up to 20 cards per deck. Pro gives unlimited decks, up to 60 cards per deck, Deep Dive generation, Living Decks (auto-refresh on weak cards), and PDF export. Both have the same 10MB upload limit and no page cap.",
  },
  {
    q: "I paid for Pro but it's not showing yet.",
    a: `${UIMessages.verificationEta} Payments are verified manually, not automatic — if it's been longer than that, email us below with your GCash reference number.`,
  },
  {
    q: "How do I delete my account?",
    a: "Go to Settings → Danger zone → Delete my account. This permanently deletes your account, decks, flashcards, and quiz history — it can't be undone.",
  },
  {
    q: "Something's broken or I have another question.",
    a: "Email us below with what you were trying to do and what happened — screenshots help a lot.",
  },
] as const;

export default function HelpPage() {
  const [copied, setCopied] = useState(false);

  async function copyEmail() {
    await navigator.clipboard.writeText(App.supportEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-body, sans-serif)" }}>
      {/* ── NAVBAR ── */}
      <Navbar backHref={Routes.dashboard} centerWordmark sectionLabel="Help" />

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 24px 64px" }}>
        <h1 style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(26px * var(--font-scale))", fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
          Help &amp; Support
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "calc(14px * var(--font-scale))", marginBottom: 28 }}>
          Common questions, and how to reach us if you&apos;re stuck.
        </p>

        {/* Contact card — up front, not buried under the FAQ */}
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <p style={{ fontSize: "calc(11px * var(--font-scale))", fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 10 }}>
            Contact support
          </p>
          <button
            type="button"
            onClick={copyEmail}
            title="Click to copy"
            style={{
              display: "inline-block",
              maxWidth: "100%",
              fontFamily: "var(--font-body, sans-serif)",
              fontSize: "calc(15px * var(--font-scale))",
              fontWeight: 700,
              color: "var(--primary)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              wordBreak: "break-word",
            }}
          >
            {App.supportEmail}
          </button>
          <p style={{ fontSize: "calc(12px * var(--font-scale))", color: copied ? "var(--success)" : "var(--text-faint)", margin: "4px 0 0", fontWeight: copied ? 600 : 400 }}>
            {copied ? "Copied!" : "Tap to copy"}
          </p>
          <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-faint)", margin: "8px 0 0" }}>
            We&apos;re a small team — expect a reply within a day or two.
          </p>
        </div>

        {/* FAQ */}
        {FAQS.map((item) => (
          <div key={item.q} style={cardStyle}>
            <p style={{ fontFamily: "var(--font-display, serif)", fontWeight: 700, fontSize: "calc(15px * var(--font-scale))", color: "var(--text)", marginBottom: 6 }}>
              {item.q}
            </p>
            <p style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-muted)", lineHeight: 1.6, margin: 0 }}>
              {item.a}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
