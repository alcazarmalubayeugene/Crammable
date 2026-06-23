import { App, Routes } from "@/lib/contracts";

/**
 * App-wide 404 (App Router convention). Branded, read-only, no auth — mirrors the
 * error-state markup used in results/[sessionId]/page.tsx so a bad URL still feels
 * like part of the app rather than a bare Next.js page.
 */
export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: "40px 24px",
        textAlign: "center",
        fontFamily: "var(--font-body, sans-serif)",
      }}
    >
      <img
        src="/capy/capy-reading.png"
        alt=""
        width={120}
        height={120}
        style={{ objectFit: "contain", marginBottom: 4 }}
      />
      <h1
        style={{
          fontFamily: "var(--font-display, serif)",
          fontSize: "calc(28px * var(--font-scale))",
          fontWeight: 700,
          color: "var(--text)",
          margin: 0,
        }}
      >
        Page not found
      </h1>
      <p style={{ color: "var(--text-muted)", fontSize: "calc(15px * var(--font-scale))", margin: 0, maxWidth: 360 }}>
        That page wandered off. The link may be broken or the page may have moved.
      </p>
      <a
        href={Routes.home}
        style={{ color: "var(--primary)", textDecoration: "none", fontWeight: 600, fontSize: "calc(14px * var(--font-scale))", marginTop: 4 }}
      >
        ← Back to {App.name}
      </a>
    </main>
  );
}
