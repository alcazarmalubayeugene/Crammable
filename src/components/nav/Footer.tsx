import { App } from "@/lib/contracts";

/**
 * Shared site footer. Extracted verbatim from the landing page (the only page
 * that carries a footer today) so the markup has a reusable home. Presentational
 * only — no props.
 */
export function Footer() {
  return (
    <footer style={{ padding: "40px 24px", textAlign: "center" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontFamily: "var(--font-display, serif)", fontWeight: 700, color: "var(--primary)", fontSize: "calc(17px * var(--font-scale))" }}>
          {App.name}
        </span>
      </div>
      <p style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--text-muted)" }}>
        Turn any document into a flashcard deck — in seconds.
      </p>
      <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", marginTop: 14 }}>
        © 2026 {App.name} · Built for Filipino students ·{" "}
        <a href="mailto:support@crammable.ph" style={{ color: "var(--primary)" }}>
          support@crammable.ph
        </a>
      </p>
      <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", marginTop: 8, maxWidth: 480, margin: "8px auto 0" }}>
        AI-generated content may contain errors. Always verify against your official course materials and textbooks.
      </p>
    </footer>
  );
}
