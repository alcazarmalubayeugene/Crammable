import { PdfUploadFlow } from "@/components/upload/PdfUploadFlow";
import { App, MAX_UPLOAD_SIZE_MB, Routes } from "@/lib/contracts";

export const metadata = {
  title: `New Deck — ${App.name}`,
};

export default function NewDeckPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#FAF2E4", fontFamily: "var(--font-dm-sans, sans-serif)" }}>

      {/* ── NAVBAR ── */}
      <nav style={{ background: "#2E1A0C", borderBottom: "1px solid #4A2512", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <a href={Routes.dashboard} style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
              <span style={{ fontSize: 14, color: "#C49A6C" }}>← Back</span>
            </a>
            <span style={{ color: "#4A2512", margin: "0 8px" }}>|</span>
            <span style={{ fontSize: 24 }}>🦫</span>
            <span style={{ fontFamily: "var(--font-lora, serif)", fontWeight: 700, fontSize: 18, color: "#FAF2E4" }}>
              {App.name}
            </span>
          </div>
          <span style={{ fontSize: 13, color: "#C49A6C" }}>New Deck</span>
        </div>
      </nav>

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px" }}>

        {/* Page header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: "var(--font-lora, serif)", fontSize: 28, fontWeight: 700, color: "#2E1A0C", marginBottom: 8 }}>
            Create a new deck
          </h1>
          <p style={{ color: "#8A6E52", fontSize: 15, lineHeight: 1.6 }}>
            Upload a PDF reviewer and Capy will turn it into flashcards in seconds.
            Max {MAX_UPLOAD_SIZE_MB} MB per file.
          </p>
        </div>

        {/* Upload card */}
        <div style={{ background: "#FFFCF7", border: "1.5px solid #E0C9A8", borderRadius: 20, padding: "32px" }}>
          <PdfUploadFlow />
        </div>

        {/* Disclaimer */}
        <p style={{ marginTop: 20, fontSize: 12, color: "#8A6E52", textAlign: "center", lineHeight: 1.6 }}>
          {App.tagline} AI-generated content may contain errors — always verify against your official course materials.
        </p>

      </div>
    </main>
  );
}
