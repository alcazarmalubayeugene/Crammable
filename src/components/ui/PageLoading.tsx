// Shared full-page loading screen — spinner + message, reused across every
// page's `if (loading)` / Suspense-fallback block so they animate instead of
// sitting on bare static text.
export function PageLoading({ message = "Loading…" }: { message?: string }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="spinner" />
        <p
          style={{
            color: "var(--text-muted)",
            fontFamily: "var(--font-body, sans-serif)",
            fontSize: "calc(14px * var(--font-scale))",
            margin: 0,
          }}
        >
          {message}
        </p>
      </div>
    </main>
  );
}
