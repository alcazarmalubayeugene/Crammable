"use client";

import { useState } from "react";
import { Routes } from "@/lib/contracts";

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

    const res = await fetch("/api/auth/signup", {
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
    background: "#FAF2E4",
    border: "1.5px solid #E0C9A8",
    borderRadius: 10,
    fontSize: 14,
    color: "#2E1A0C",
    outline: "none",
    boxSizing: "border-box" as const,
    fontFamily: "var(--font-dm-sans, sans-serif)",
  };

  const labelStyle = {
    display: "block" as const,
    fontSize: 13,
    fontWeight: 600,
    color: "#2E1A0C",
    marginBottom: 6,
  };

  // Success state — email verification sent
  if (success) {
    return (
      <main style={{ minHeight: "100vh", background: "#FAF2E4", fontFamily: "var(--font-dm-sans, sans-serif)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontSize: 64, marginBottom: 20 }}>📬</div>
          <h1 style={{ fontFamily: "var(--font-lora, serif)", fontSize: 24, fontWeight: 700, color: "#2E1A0C", marginBottom: 12 }}>
            Check your email
          </h1>
          <p style={{ color: "#8A6E52", fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
            We sent a verification link to <strong style={{ color: "#2E1A0C" }}>{email}</strong>.
            Click the link in that email to activate your account.
          </p>
          <div style={{ borderTop: "1px solid #E0C9A8", paddingTop: 20, marginBottom: 20 }}>
            <p style={{ color: "#8A6E52", fontSize: 13, marginBottom: 12 }}>
              Didn&apos;t get the email? Check your spam folder, or
            </p>
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              style={{ padding: "10px 20px", background: resending ? "#A86826" : "#C47A2E", color: "#FAF2E4", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: resending ? "not-allowed" : "pointer", fontFamily: "var(--font-dm-sans, sans-serif)" }}
            >
              {resending ? "Sending…" : "Resend confirmation email"}
            </button>
            {resendMsg && (
              <p style={{ color: "#5A7A52", fontSize: 13, marginTop: 12, lineHeight: 1.6 }}>
                {resendMsg}
              </p>
            )}
          </div>

          <p style={{ color: "#8A6E52", fontSize: 13 }}>
            Already verified?{" "}
            <a href="/login" style={{ color: "#C47A2E", fontWeight: 600, textDecoration: "none" }}>
              Log in
            </a>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "#FAF2E4", fontFamily: "var(--font-dm-sans, sans-serif)" }}>

      {/* ── NAVBAR ── */}
      <nav style={{ background: "#2E1A0C", borderBottom: "1px solid #4A2512" }}>
        <div style={{ maxWidth: 1024, margin: "0 auto", padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <span style={{ fontSize: 24 }}>🦫</span>
            <span style={{ fontFamily: "var(--font-lora, serif)", fontWeight: 700, fontSize: 18, color: "#FAF2E4" }}>
              Crammable
            </span>
          </a>
          <a href="/login" style={{ fontSize: 13, color: "#C49A6C", textDecoration: "none" }}>
            Already have an account?{" "}
            <span style={{ color: "#C47A2E", fontWeight: 600 }}>Log in</span>
          </a>
        </div>
      </nav>

      {/* ── SIGNUP CARD ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", minHeight: "calc(100vh - 64px)", padding: "48px 24px" }}>
        <div style={{ width: "100%", maxWidth: 480 }}>

          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🦫</div>
            <h1 style={{ fontFamily: "var(--font-lora, serif)", fontSize: 26, fontWeight: 700, color: "#2E1A0C", marginBottom: 6 }}>
              Create your account
            </h1>
            <p style={{ color: "#8A6E52", fontSize: 14 }}>
              3 free credits included — no card required
            </p>
          </div>

          <div style={{ background: "#FFFCF7", border: "1.5px solid #E0C9A8", borderRadius: 20, padding: 32 }}>

            {error && (
              <div style={{ background: "#FEF0E0", border: "1px solid #E0C9A8", borderRadius: 10, padding: "10px 14px", marginBottom: 20, fontSize: 13, color: "#8B5E38" }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>

              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Full name <span style={{ color: "#C47A2E" }}>*</span></label>
                <input type="text" placeholder="Juan dela Cruz" value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputStyle} />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Email address <span style={{ color: "#C47A2E" }}>*</span></label>
                <input type="email" placeholder="you@university.edu.ph" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Course / Program <span style={{ color: "#C47A2E" }}>*</span></label>
                <input type="text" placeholder="e.g. BS Nursing, BS Computer Science" value={course} onChange={(e) => setCourse(e.target.value)} style={inputStyle} />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Referral code <span style={{ color: "#8A6E52", fontWeight: 400 }}>(optional)</span></label>
                <input type="text" placeholder="8-character code from a friend" value={referral} onChange={(e) => setReferral(e.target.value)} style={inputStyle} />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Password <span style={{ color: "#C47A2E" }}>*</span></label>
                <input type="password" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Confirm password <span style={{ color: "#C47A2E" }}>*</span></label>
                <input type="password" placeholder="Repeat your password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={inputStyle} />
              </div>

              <div style={{ background: "#FBF0E0", border: "1.5px solid #E0C9A8", borderRadius: 12, padding: 16, marginBottom: 24 }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 2, width: 16, height: 16, accentColor: "#C47A2E", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: "#2E1A0C", lineHeight: 1.6 }}>
                    <strong>I understand and agree</strong> that my uploaded documents will be processed by DeepSeek AI to generate flashcards. I will not upload sensitive or confidential information.{" "}
                    <span style={{ color: "#C47A2E" }}>*</span>
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{ width: "100%", padding: "12px 0", background: loading ? "#A86826" : "#C47A2E", color: "#FAF2E4", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", fontFamily: "var(--font-dm-sans, sans-serif)" }}
              >
                {loading ? "Creating account…" : "Create account — it's free"}
              </button>

            </form>

            <p style={{ textAlign: "center", fontSize: 13, color: "#8A6E52", marginTop: 20, marginBottom: 0 }}>
              Already have an account?{" "}
              <a href="/login" style={{ color: "#C47A2E", fontWeight: 600, textDecoration: "none" }}>Log in</a>
            </p>

          </div>

          <p style={{ textAlign: "center", fontSize: 12, color: "#8A6E52", marginTop: 20 }}>
            By signing up you agree to our Terms of Service and Privacy Policy.
          </p>

        </div>
      </div>
    </main>
  );
}
