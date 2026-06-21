import { PdfUploadFlow } from "@/components/upload/PdfUploadFlow";
import { App, MAX_UPLOAD_SIZE_MB, Routes } from "@/lib/contracts";

export const metadata = {
  title: `New Deck — ${App.name}`,
};

export default function NewDeckPage() {
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
            <img src="/capy/capy-idle.svg" alt="" width={29} height={24} style={{ height: "calc(24px * var(--font-scale))", width: "auto" }} />
            <span style={{ fontFamily: "var(--font-display, serif)", fontWeight: 700, fontSize: "calc(18px * var(--font-scale))", color: "var(--nav-text)" }}>
              {App.name}
            </span>
          </div>
          <span style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--primary)", fontWeight: 700 }}>New Deck</span>
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
