"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiPaths, App, Routes } from "@/lib/contracts";

export default function SignupPage() {
  const [fullName, setFullName]   = useState("");
  const [email, setEmail]         = useState("");
  const [course, setCourse]       = useState("");
  const [referral, setReferral]   = useState("");
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [consent, setConsent]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!fullName || !email || !course || !password || !confirm) {
      setError("Please fill in all required fields.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!consent) {
      setError("You must agree to AI processing to use Crammable.");
      return;
    }

    setLoading(true);

    const res = await fetch(ApiPaths.authSignup, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        fullName,
        course,
        referralCode: referral || undefined,
        consentDeepseek: consent,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!data.success) {
      setError(data.error?.message ?? "Something went wrong. Please try again.");
      return;
    }

    // Show email verification message
    setSuccess(true);
  }

  async function handleResend() {
    setResendMsg("");
    setResending(true);
    try {
      const res = await fetch(Routes.api.authResendConfirmation, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      // The endpoint is enumeration-safe and always returns the same message.
      setResendMsg(
        data.message ??
          "If an account with that email needs confirming, we've sent a new link."
      );
    } catch {
      setResendMsg("Couldn't resend right now. Please try again in a moment.");
    } finally {
      setResending(false);
    }
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

  const labelStyle = {
    display: "block" as const,
    fontSize: "calc(13px * var(--font-scale))",
    fontWeight: 600,
    color: "var(--text)",
    marginBottom: 6,
  };

  // Success state — email verification sent
  if (success) {
    return (
      <main style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-body, sans-serif)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontSize: "calc(64px * var(--font-scale))", marginBottom: 20 }}>📬</div>
          <h1 style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(24px * var(--font-scale))", fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>
            Check your email
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "calc(14px * var(--font-scale))", lineHeight: 1.7, marginBottom: 24 }}>
            We sent a verification link to <strong style={{ color: "var(--text)" }}>{email}</strong>.
            Click the link in that email to activate your account.
          </p>
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 20, marginBottom: 20 }}>
            <p style={{ color: "var(--text-muted)", fontSize: "calc(13px * var(--font-scale))", marginBottom: 12 }}>
              Didn&apos;t get the email? Check your spam folder, or
            </p>
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              style={{ padding: "10px 20px", background: resending ? "var(--primary-hover)" : "var(--primary)", color: "var(--nav-text)", border: "none", borderRadius: 10, fontSize: "calc(14px * var(--font-scale))", fontWeight: 600, cursor: resending ? "not-allowed" : "pointer", fontFamily: "var(--font-body, sans-serif)" }}
            >
              {resending ? "Sending…" : "Resend confirmation email"}
            </button>
            {resendMsg && (
              <p style={{ color: "var(--success-dark)", fontSize: "calc(13px * var(--font-scale))", marginTop: 12, lineHeight: 1.6 }}>
                {resendMsg}
              </p>
            )}
          </div>

          <p style={{ color: "var(--text-muted)", fontSize: "calc(13px * var(--font-scale))" }}>
            Already verified?{" "}
            <Link href={Routes.login} style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}>
              Log in
            </Link>
          </p>
        </div>
      </main>
    );
  }

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
          <Link href={Routes.login} style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-faint)", textDecoration: "none" }}>
            Already have an account?{" "}
            <span style={{ color: "var(--primary)", fontWeight: 600 }}>Log in</span>
          </Link>
        </div>
      </nav>

      {/* ── SIGNUP CARD ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", minHeight: "calc(100vh - 64px)", padding: "48px 24px" }}>
        <div style={{ width: "100%", maxWidth: 480 }}>

          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: "calc(48px * var(--font-scale))", marginBottom: 12 }}>🦫</div>
            <h1 style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(26px * var(--font-scale))", fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
              Create your account
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "calc(14px * var(--font-scale))" }}>
              3 free Capycoins included — no card required
            </p>
          </div>

          <div style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: 20, padding: 32 }}>

            {error && (
              <div style={{ background: "var(--error-bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", marginBottom: 20, fontSize: "calc(13px * var(--font-scale))", color: "var(--error-dark)" }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>

              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Full name <span style={{ color: "var(--primary)" }}>*</span></label>
                <input type="text" placeholder="Juan dela Cruz" value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputStyle} />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Email address <span style={{ color: "var(--primary)" }}>*</span></label>
                <input type="email" placeholder="you@university.edu.ph" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Course / Program <span style={{ color: "var(--primary)" }}>*</span></label>
                <input type="text" placeholder="e.g. BS Nursing, BS Computer Science" value={course} onChange={(e) => setCourse(e.target.value)} style={inputStyle} />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Referral code <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optional)</span></label>
                <input type="text" placeholder="8-character code from a friend" value={referral} onChange={(e) => setReferral(e.target.value)} style={inputStyle} />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Password <span style={{ color: "var(--primary)" }}>*</span></label>
                <input type="password" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Confirm password <span style={{ color: "var(--primary)" }}>*</span></label>
                <input type="password" placeholder="Repeat your password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={inputStyle} />
              </div>

              <div style={{ background: "var(--bg-subtle)", border: "1.5px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 24 }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 2, width: 16, height: 16, accentColor: "var(--primary)", flexShrink: 0 }} />
                  <span style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text)", lineHeight: 1.6 }}>
                    <strong>I understand and agree</strong> that my uploaded documents will be processed by DeepSeek AI to generate flashcards. I will not upload sensitive or confidential information.{" "}
                    <span style={{ color: "var(--primary)" }}>*</span>
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{ width: "100%", padding: "12px 0", background: loading ? "var(--primary-hover)" : "var(--primary)", color: "var(--nav-text)", border: "none", borderRadius: 10, fontSize: "calc(15px * var(--font-scale))", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", fontFamily: "var(--font-body, sans-serif)" }}
              >
                {loading ? "Creating account…" : "Create account — it's free"}
              </button>

            </form>

            <p style={{ textAlign: "center", fontSize: "calc(13px * var(--font-scale))", color: "var(--text-muted)", marginTop: 20, marginBottom: 0 }}>
              Already have an account?{" "}
              <Link href={Routes.login} style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}>Log in</Link>
            </p>

          </div>

          <p style={{ textAlign: "center", fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", marginTop: 20 }}>
            By signing up you agree to our Terms of Service and Privacy Policy.
          </p>

        </div>
      </div>
    </main>
  );
}
