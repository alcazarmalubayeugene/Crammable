"use client";

import { useEffect } from "react";
import { App, Routes } from "@/lib/contracts";

/**
 * App-wide error boundary (App Router convention — must be a Client Component).
 * Catches render/runtime errors in route segments, logs the cause server-/client-
 * side, and offers a recoverable "Try again" (reset) plus an escape home. The raw
 * error/stack is never shown to the user.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error boundary]", error);
  }, [error]);

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
        Something went wrong
      </h1>
      <p style={{ color: "var(--text-muted)", fontSize: "calc(15px * var(--font-scale))", margin: 0, maxWidth: 360 }}>
        That wasn&apos;t supposed to happen. You can try again, or head back and pick up where you left off.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          type="button"
          onClick={reset}
          style={{
            background: "var(--primary)",
            color: "var(--nav-text)",
            border: "none",
            borderRadius: 10,
            padding: "11px 24px",
            fontSize: "calc(14px * var(--font-scale))",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "var(--font-body, sans-serif)",
          }}
        >
          Try again
        </button>
        <a
          href={Routes.home}
          style={{ color: "var(--primary)", textDecoration: "none", fontWeight: 600, fontSize: "calc(14px * var(--font-scale))" }}
        >
          ← Back to {App.name}
        </a>
      </div>
    </main>
  );
}
