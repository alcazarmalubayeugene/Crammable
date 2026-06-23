"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ApiPaths, App, Routes, type PublicQuizResult } from "@/lib/contracts";
import { PageLoading } from "@/components/ui/PageLoading";
import { Navbar } from "@/components/nav/Navbar";

/**
 * Read-only public quiz-result viewer — no auth required. Mirrors
 * /public/decks/[id]/page.tsx's shape (fetch → loading/error/content states),
 * scoped to a single quiz session instead of a deck.
 *
 * NOT YET FUNCTIONAL — GET /api/public/results/[sessionId] doesn't exist yet
 * (no quiz_sessions.is_public column, no RLS policy, no route). Until that
 * backend work lands (see FRONTEND.md "Backend work needed: shareable quiz
 * results"), every link this page is given will show the error state below.
 * The UI is built ahead of the backend on purpose, same as result/page.tsx's
 * "Share this result" toggle that links here.
 */
export default function PublicResultPage() {
  const params = useParams();
  const sessionId = Array.isArray(params.sessionId) ? params.sessionId[0] : (params.sessionId as string);

  const [result, setResult] = useState<PublicQuizResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(ApiPaths.publicResult(sessionId));
        const data = (await res.json()) as { success: boolean; result?: PublicQuizResult; error?: { message: string } };
        if (!data.success || !data.result) {
          setError("This result isn't public, or it doesn't exist.");
          setLoading(false);
          return;
        }
        setResult(data.result);
        setLoading(false);
      } catch {
        setError("Failed to load this result. Check your connection and try again.");
        setLoading(false);
      }
    }
    load();
  }, [sessionId]);

  if (loading) {
    return <PageLoading />;
  }

  if (error || !result) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "var(--bg)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          fontFamily: "var(--font-body, sans-serif)",
        }}
      >
        <p style={{ color: "var(--text-muted)", fontSize: "calc(15px * var(--font-scale))" }}>{error || "Result not found."}</p>
        <a
          href={Routes.home}
          style={{ color: "var(--primary)", textDecoration: "none", fontWeight: 600, fontSize: "calc(14px * var(--font-scale))" }}
        >
          ← Back to {App.name}
        </a>
      </main>
    );
  }

  const isPerfect = result.scorePercent === 100;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        fontFamily: "var(--font-body, sans-serif)",
      }}
    >
      {/* ── NAVBAR ── */}
      <Navbar wordmarkHref={Routes.home} sectionLabel="Shared result" />

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "40px 24px" }}>
        <div
          style={{
            background: "var(--bg-card)",
            border: "1.5px solid var(--border)",
            borderRadius: 20,
            padding: "40px 32px",
            textAlign: "center",
            marginBottom: 24,
          }}
        >
          <img
            src={isPerfect ? "/capy/congrats-capy.png" : "/capy/capy-reading.png"}
            alt=""
            width={120}
            height={120}
            style={{ margin: "0 auto 16px", display: "block", objectFit: "contain" }}
          />
          <div
            style={{
              fontFamily: "var(--font-display, serif)",
              fontSize: "calc(40px * var(--font-scale))",
              fontWeight: 700,
              color: isPerfect ? "var(--primary)" : "var(--text)",
              lineHeight: 1,
              marginBottom: 8,
            }}
          >
            {result.correctCount} / {result.totalQuestions}
          </div>
          <p style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--text-muted)", marginBottom: 4 }}>
            {result.scorePercent}% score
          </p>
          {result.deckTitle && (
            <p style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-faint)", fontStyle: "italic", marginTop: 8 }}>
              {result.deckTitle} Quiz
            </p>
          )}
        </div>

        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--text-muted)", marginBottom: 14 }}>
            Want to make your own flashcards and quiz yourself?
          </p>
          <a
            href={Routes.signup}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "var(--primary)",
              color: "var(--nav-text)",
              padding: "13px 32px",
              borderRadius: 10,
              fontWeight: 600,
              fontSize: "calc(15px * var(--font-scale))",
              textDecoration: "none",
            }}
          >
            Try {App.name} →
          </a>
        </div>
      </div>
    </main>
  );
}
