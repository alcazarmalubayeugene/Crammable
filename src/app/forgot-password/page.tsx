"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiPaths, Routes } from "@/lib/contracts";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [cooldown, setCooldown]   = useState(0); // seconds until resend is allowed

  // Tick the cooldown down once per second.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Guard: authenticated users have no business here → send them to the dashboard.
  useEffect(() => {
    async function guard() {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) window.location.replace(Routes.dashboard);
    }
    guard();
  }, []);

  async function sendResetLink() {
    if (loading || cooldown > 0) return;
    setError("");
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Please enter your email address.");
      return;
    }

    setLoading(true);
    try {
      await fetch(ApiPaths.authForgotPassword, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      // Route is enumeration-safe — always treat any response as success.
      setSubmitted(true);
      // Match Supabase's email rate limit so a resend never hits a 429.
      setCooldown(60);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    await sendResetLink();
  }

  const inputStyle = {
    width: "100%",
    padding: "11px 14px",
    background: "var(--bg)",
    border: "1.5px solid var(--border)",
    borderRadius: 10,
    fontSize: "calc(14px * var(--font-scale))",
    color: "var(--text)",
    outline: "none",
    boxSizing: "border-box" as const,
    fontFamily: "var(--font-body, sans-serif)",
  };

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-body, sans-serif)" }}>

      {/* ── NAVBAR ── */}
      <nav style={{ background: "var(--nav-bg)", borderBottom: "1px solid var(--nav-border)" }}>
        <div className="nav-row" style={{ maxWidth: "100%", margin: "0 auto", padding: "0 24px", minHeight: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href={Routes.home} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <span style={{ fontFamily: "var(--font-display, serif)", fontWeight: 700, fontSize: "calc(18px * var(--font-scale))", color: "var(--nav-text)" }}>
              Crammable
            </span>
          </Link>
          <Link href={Routes.login} style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}>
            ← Back to login
          </Link>
        </div>
      </nav>

      {/* ── CARD ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 64px)", padding: "40px 24px" }}>
        <div style={{ width: "100%", maxWidth: 420 }}>

          {/* Dev-only note — auto-hidden in production builds (NODE_ENV !== "development"). */}
          {process.env.NODE_ENV === "development" && (
            <div style={{ marginBottom: 20, border: "1px dashed var(--text-faint)", borderRadius: 10, padding: "10px 14px", background: "var(--bg-subtle)", fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", lineHeight: 1.5 }}>
              <strong>Dev note (testing only — hidden in production):</strong> Supabase&apos;s built-in
              email is capped at <strong>2 emails/hour, project-wide</strong> (shared across all addresses).
              Resends past that are silently dropped — it&apos;s a Supabase limit, not a bug. Custom SMTP
              is needed before launch.
            </div>
          )}

          {submitted ? (
            // ── Success state — form is hidden, enumeration-safe confirmation ──
            <div style={{ textAlign: "center" }}>
              <h1 style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(26px * var(--font-scale))", fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
                Check your inbox
              </h1>
              <div style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: 20, padding: 32 }}>
                <p style={{ color: "var(--text-muted)", fontSize: "calc(14px * var(--font-scale))", lineHeight: 1.6, margin: 0 }}>
                  We&apos;ve sent a password reset link to{" "}
                  <strong style={{ color: "var(--text)" }}>{email.trim()}</strong>{" "}
                  if an account exists.
                </p>
                <p style={{ color: "var(--text-muted)", fontSize: "calc(13px * var(--font-scale))", lineHeight: 1.6, marginTop: 16, marginBottom: 0 }}>
                  Emails can take a few minutes. Didn&apos;t get it? Check your spam folder, then{" "}
                  <button
                    type="button"
                    onClick={sendResetLink}
                    disabled={loading || cooldown > 0}
                    style={{ background: "none", border: "none", color: cooldown > 0 ? "var(--text-muted)" : "var(--primary)", fontWeight: 600, cursor: loading || cooldown > 0 ? "default" : "pointer", padding: 0, fontSize: "calc(13px * var(--font-scale))", fontFamily: "inherit", textDecoration: cooldown > 0 ? "none" : "underline" }}
                  >
                    {loading ? "Sending…" : cooldown > 0 ? `resend in ${cooldown}s` : "resend it"}
                  </button>
                  .
                </p>
              </div>
              <p style={{ marginTop: 20 }}>
                <Link href={Routes.login} style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}>
                  ← Back to login
                </Link>
              </p>
            </div>
          ) : (
            // ── Form state ──
            <>
              <div style={{ textAlign: "center", marginBottom: 32 }}>
                <h1 style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(26px * var(--font-scale))", fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
                  Forgot your password?
                </h1>
                <p style={{ color: "var(--text-muted)", fontSize: "calc(14px * var(--font-scale))" }}>
                  Enter your email and we&apos;ll send a reset link.
                </p>
              </div>

              <div style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: 20, padding: 32 }}>

                {error && (
                  <div style={{ background: "var(--error-bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: "calc(13px * var(--font-scale))", color: "var(--error-dark)" }}>
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit}>
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ display: "block", fontSize: "calc(13px * var(--font-scale))", fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
                      Email address
                    </label>
                    <input
                      type="email"
                      placeholder="you@university.edu.ph"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      style={inputStyle}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    style={{ width: "100%", padding: "12px 0", background: loading ? "var(--primary-hover)" : "var(--primary)", color: "var(--nav-text)", border: "none", borderRadius: 10, fontSize: "calc(15px * var(--font-scale))", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", fontFamily: "var(--font-body, sans-serif)" }}
                  >
                    {loading ? "Sending…" : "Send reset link"}
                  </button>
                </form>

                <p style={{ textAlign: "center", fontSize: "calc(13px * var(--font-scale))", color: "var(--text-muted)", marginTop: 24, marginBottom: 0 }}>
                  Remembered it?{" "}
                  <Link href={Routes.login} style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}>
                    Back to login
                  </Link>
                </p>

              </div>
            </>
          )}

        </div>
      </div>

    </main>
  );
}
