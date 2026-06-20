"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiPaths, App, Routes } from "@/lib/contracts";

export default function LoginPage() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent">("idle");

  async function handleResend() {
    if (resendStatus !== "idle") return;
    setResendStatus("sending");
    if (email.trim()) {
      try {
        await fetch(ApiPaths.authResendConfirmation, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim() }),
        });
      } catch {
        // network error — safe "sent" message shown regardless
      }
    }
    setResendStatus("sent");
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setError("");
    setResendStatus("idle");

    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);

    const res = await fetch(ApiPaths.authLogin, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    setLoading(false);

    if (!data.success) {
      setError(data.error?.message ?? "Invalid email or password.");
      return;
    }

    // replace() prevents the login page from appearing in browser back-history
    window.location.replace(Routes.dashboard);
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
        <div style={{ maxWidth: 1024, margin: "0 auto", padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <span style={{ fontSize: "calc(24px * var(--font-scale))" }}>🦫</span>
            <span style={{ fontFamily: "var(--font-display, serif)", fontWeight: 700, fontSize: "calc(18px * var(--font-scale))", color: "var(--nav-text)" }}>
              {App.name}
            </span>
          </Link>
          <Link href={Routes.signup} style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-faint)", textDecoration: "none" }}>
            No account yet?{" "}
            <span style={{ color: "var(--primary)", fontWeight: 600 }}>Sign up free</span>
          </Link>
        </div>
      </nav>

      {/* ── LOGIN CARD ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 64px)", padding: "40px 24px" }}>
        <div style={{ width: "100%", maxWidth: 420 }}>

          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontSize: "calc(48px * var(--font-scale))", marginBottom: 12 }}>🦫</div>
            <h1 style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(26px * var(--font-scale))", fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
              Welcome back
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "calc(14px * var(--font-scale))" }}>
              Log in to your Crammable account
            </p>
          </div>

          <div style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: 20, padding: 32 }}>

            {error && (
              <div style={{ background: "var(--error-bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: "calc(13px * var(--font-scale))", color: "var(--error-dark)" }}>
                {error}
              </div>
            )}

            {/* Prominent resend prompt — surfaces after any failed login attempt */}
            {error && resendStatus !== "sent" && (
              <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", marginBottom: 20, fontSize: "calc(13px * var(--font-scale))", color: "var(--text-muted)" }}>
                Haven&apos;t confirmed your email yet?{" "}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendStatus !== "idle"}
                  style={{ background: "none", border: "none", color: "var(--primary)", fontWeight: 600, cursor: resendStatus === "idle" ? "pointer" : "default", padding: 0, fontSize: "calc(13px * var(--font-scale))", fontFamily: "inherit", textDecoration: "underline" }}
                >
                  {resendStatus === "sending" ? "Sending…" : "Resend confirmation email"}
                </button>
              </div>
            )}
            {error && resendStatus === "sent" && (
              <div style={{ background: "var(--success-bg)", border: "1px solid var(--success)", borderRadius: 10, padding: "10px 14px", marginBottom: 20, fontSize: "calc(13px * var(--font-scale))", color: "var(--success-dark)" }}>
                Sent! Check your inbox (and spam folder).
              </div>
            )}

            <form onSubmit={handleSubmit}>

              <div style={{ marginBottom: 18 }}>
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

              <div style={{ marginBottom: 10 }}>
                <label style={{ display: "block", fontSize: "calc(13px * var(--font-scale))", fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
                  Password
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div style={{ textAlign: "right", marginBottom: 24 }}>
                <Link href={Routes.forgotPassword} style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--primary)", textDecoration: "none" }}>
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{ width: "100%", padding: "12px 0", background: loading ? "var(--primary-hover)" : "var(--primary)", color: "var(--nav-text)", border: "none", borderRadius: 10, fontSize: "calc(15px * var(--font-scale))", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", fontFamily: "var(--font-body, sans-serif)" }}
              >
                {loading ? "Logging in…" : "Log in"}
              </button>

            </form>

            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0" }}>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              <span style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)" }}>or</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>

            <p style={{ textAlign: "center", fontSize: "calc(13px * var(--font-scale))", color: "var(--text-muted)", margin: 0 }}>
              Don&apos;t have an account?{" "}
              <Link href={Routes.signup} style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}>
                Sign up free
              </Link>
            </p>

            {/* Passive resend affordance — always visible so it doesn't signal account existence */}
            <p style={{ textAlign: "center", fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", marginTop: 12, marginBottom: 0 }}>
              {resendStatus === "sent" && !error ? (
                "Sent! Check your inbox (and spam folder)."
              ) : (
                <>
                  Didn&apos;t receive a confirmation email?{" "}
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendStatus !== "idle"}
                    style={{ background: "none", border: "none", color: "var(--primary)", cursor: resendStatus === "idle" ? "pointer" : "default", padding: 0, fontSize: "calc(12px * var(--font-scale))", fontFamily: "inherit", textDecoration: "underline" }}
                  >
                    {resendStatus === "sending" ? "Sending…" : "Resend it"}
                  </button>
                </>
              )}
            </p>

          </div>

          <p style={{ textAlign: "center", fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", marginTop: 20 }}>
            3 free Capycoins included when you sign up. No card required.
          </p>

        </div>
      </div>

    </main>
  );
}
