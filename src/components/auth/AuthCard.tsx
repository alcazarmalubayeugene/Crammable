"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiPaths, App, Routes } from "@/lib/contracts";
import { signInWithGoogle } from "@/lib/supabase/browser";
import {
  THEME_STORAGE_KEY,
  FONT_SIZE_STORAGE_KEY,
  FONT_PAIR_STORAGE_KEY,
} from "@/lib/theme/ThemeProvider";

type Mode = "login" | "signup";

function PasswordToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      tabIndex={-1}
      aria-label={show ? "Hide password" : "Show password"}
      title={show ? "Hide password" : "Show password"}
      style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", padding: 6, cursor: "pointer", display: "flex", alignItems: "center", color: "var(--text-faint)" }}
    >
      {show ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}

export default function AuthCard({ initialMode }: { initialMode: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);

  // Shared between both modes
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  // Login-only
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent">("idle");

  // Google OAuth
  const [googleLoading, setGoogleLoading] = useState(false);

  // Password visibility — shared show/hide state for the password field in
  // both modes, plus a separate one for signup's confirm-password field.
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);

  // Signup-only — full name, course, and referral code are collected in the
  // one-question-at-a-time /onboarding/* flow after email confirmation instead
  // of all at once here.
  const [confirm, setConfirm]     = useState("");
  const [consent, setConsent]     = useState(false);
  const [success, setSuccess]     = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState("");

  // Toggling mode swaps form fields in place rather than navigating to the
  // other route — keeps this feeling like one card, not two separate pages.
  // history.replaceState (not the Next router) keeps the URL in sync without
  // remounting this component.
  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setResendStatus("idle");
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", next === "login" ? Routes.login : Routes.signup);
    }
  }

  async function handleResend() {
    if (mode === "login") {
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
    } else {
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
  }

  async function handleLoginSubmit(e: React.SyntheticEvent) {
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

    // Hydrate the user's synced theme/font prefs into localStorage so the
    // anti-flash script + ThemeProvider apply them on the dashboard load — this
    // is what makes prefs follow the user onto a fresh device after login.
    const prof = data.profile;
    if (prof) {
      if (prof.theme_preference) localStorage.setItem(THEME_STORAGE_KEY, prof.theme_preference);
      if (prof.font_size_preference) localStorage.setItem(FONT_SIZE_STORAGE_KEY, prof.font_size_preference);
      if (prof.font_pair_preference) localStorage.setItem(FONT_PAIR_STORAGE_KEY, prof.font_pair_preference);
    }

    // replace() prevents the login page from appearing in browser back-history
    window.location.replace(Routes.dashboard);
  }

  async function handleSignupSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!email || !password || !confirm) {
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
        consentDeepseek: consent,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!data.success) {
      setError(data.error?.message ?? "Something went wrong. Please try again.");
      return;
    }

    // Full name / course / referral are collected one question at a time on
    // /onboarding/* right after email confirmation — the dashboard checks for
    // this flag and redirects there instead of showing the dashboard directly.
    localStorage.setItem("cm_pending_onboarding", "1");
    setSuccess(true);
  }

  async function handleGoogle() {
    setError("");
    const signingUp = mode === "signup";

    // Signup mode gates Google behind the same consent the email form requires —
    // RA 10173: no document reaches DeepSeek without the user agreeing first.
    // The decision is carried to /api/auth/callback (consent=1) and persisted
    // there. Login mode is for returning users who already consented at signup.
    if (signingUp && !consent) {
      setError("You must agree to AI processing to use Crammable.");
      return;
    }

    setGoogleLoading(true);
    const { error: oauthError } = await signInWithGoogle({
      consent: signingUp && consent,
      flow: signingUp ? "signup" : "login",
    });

    // On success the browser navigates to Google, so we only land here on error.
    if (oauthError) {
      setGoogleLoading(false);
      setError("Couldn't start Google sign-in. Please try again.");
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

  const linkButtonStyle = {
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    fontFamily: "inherit",
  };

  // Success state — email verification sent after signup
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

  const isLogin = mode === "login";

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-body, sans-serif)" }}>

      {/* ── AUTH CARD — logo, header, toggle, form, and alt options all live in
          one floating card with no surrounding nav, matching Gizmo's format.
          Always top-aligned with the same padding in both modes — switching
          login/signup used to also flip center↔top alignment, which made the
          card jump on every toggle instead of just growing/shrinking in place. ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 24px" }}>
        <div style={{ width: "100%", maxWidth: 440 }}>

          {/* key={mode} remounts this box on every toggle so the fadeUp
              entrance animation replays — a quick, smooth crossfade instead
              of an instant content swap. */}
          <div key={mode} className="anim-fade-up" style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: 24, padding: 28, boxShadow: "0 10px 28px rgba(0,0,0,0.12)" }}>

            <Link href="/" style={{ display: "block", textAlign: "center", textDecoration: "none", marginBottom: 14 }}>
              <span style={{ fontFamily: "var(--font-display, serif)", fontWeight: 700, fontSize: "calc(19px * var(--font-scale))", color: "var(--text)" }}>
                {App.name}
              </span>
            </Link>

            <div style={{ textAlign: "center", marginBottom: 14 }}>
              <h1 style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(22px * var(--font-scale))", fontWeight: 700, color: "var(--text)", marginBottom: 3 }}>
                {isLogin ? "Welcome back" : "Create your account"}
              </h1>
              <p style={{ color: "var(--text-muted)", fontSize: "calc(13px * var(--font-scale))" }}>
                {isLogin ? "Log in to your Crammable account" : "3 free Capycoins included — no card required"}
              </p>
            </div>

            <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
              <div style={{ display: "inline-flex", background: "var(--bg-subtle)", borderRadius: 999, padding: 4, gap: 4 }}>
                <button
                  type="button"
                  onClick={() => switchMode("signup")}
                  style={{
                    ...linkButtonStyle,
                    padding: "8px 22px",
                    borderRadius: 999,
                    fontSize: "calc(13px * var(--font-scale))",
                    fontWeight: 600,
                    background: !isLogin ? "var(--bg-card)" : "transparent",
                    color: !isLogin ? "var(--text)" : "var(--text-muted)",
                    boxShadow: !isLogin ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                  }}
                >
                  Sign up
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  style={{
                    ...linkButtonStyle,
                    padding: "8px 22px",
                    borderRadius: 999,
                    fontSize: "calc(13px * var(--font-scale))",
                    fontWeight: 600,
                    background: isLogin ? "var(--bg-card)" : "transparent",
                    color: isLogin ? "var(--text)" : "var(--text-muted)",
                    boxShadow: isLogin ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                  }}
                >
                  Sign in
                </button>
              </div>
            </div>

            {error && (
              <div style={{ background: "var(--error-bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: "calc(13px * var(--font-scale))", color: "var(--error-dark)" }}>
                {error}
              </div>
            )}

            {/* Prominent resend prompt — surfaces after any failed login attempt */}
            {isLogin && error && resendStatus !== "sent" && (
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
            {isLogin && error && resendStatus === "sent" && (
              <div style={{ background: "var(--success-bg)", border: "1px solid var(--success)", borderRadius: 10, padding: "10px 14px", marginBottom: 20, fontSize: "calc(13px * var(--font-scale))", color: "var(--success-dark)" }}>
                Sent! Check your inbox (and spam folder).
              </div>
            )}

            {isLogin ? (
              <form onSubmit={handleLoginSubmit}>

                <div style={{ marginBottom: 11 }}>
                  <label style={labelStyle}>Email address</label>
                  <input
                    type="email"
                    placeholder="you@university.edu.ph"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: 8 }}>
                  <label style={labelStyle}>Password</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      style={{ ...inputStyle, paddingRight: 40 }}
                    />
                    <PasswordToggle show={showPassword} onToggle={() => setShowPassword((v) => !v)} />
                  </div>
                </div>

                <div style={{ textAlign: "right", marginBottom: 16 }}>
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
            ) : (
              <form onSubmit={handleSignupSubmit}>

                <div style={{ marginBottom: 11 }}>
                  <label style={labelStyle}>Email address <span style={{ color: "var(--primary)" }}>*</span></label>
                  <input type="email" placeholder="you@university.edu.ph" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
                </div>

                <div style={{ marginBottom: 11 }}>
                  <label style={labelStyle}>Password <span style={{ color: "var(--primary)" }}>*</span></label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      style={{ ...inputStyle, paddingRight: 40 }}
                    />
                    <PasswordToggle show={showPassword} onToggle={() => setShowPassword((v) => !v)} />
                  </div>
                </div>

                <div style={{ marginBottom: 11 }}>
                  <label style={labelStyle}>Confirm password <span style={{ color: "var(--primary)" }}>*</span></label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showConfirm ? "text" : "password"}
                      placeholder="Repeat your password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      style={{ ...inputStyle, paddingRight: 40 }}
                    />
                    <PasswordToggle show={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />
                  </div>
                </div>

                <div style={{ background: "var(--bg-subtle)", border: "1.5px solid var(--border)", borderRadius: 12, padding: 13, marginBottom: 13 }}>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                    <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 2, width: 16, height: 16, accentColor: "var(--primary)", flexShrink: 0 }} />
                    <span style={{ fontSize: "calc(12.5px * var(--font-scale))", color: "var(--text)", lineHeight: 1.5 }}>
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
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "13px 0" }}>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              <span style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)" }}>or</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>

            {/* Google OAuth (PKCE). In signup mode the consent checkbox above
                must be ticked first — handleGoogle enforces it and carries the
                decision to /api/auth/callback. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              <button
                type="button"
                onClick={handleGoogle}
                disabled={googleLoading}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "9px 0", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: googleLoading ? "var(--text-faint)" : "var(--text)", fontSize: "calc(13px * var(--font-scale))", fontWeight: 600, cursor: googleLoading ? "not-allowed" : "pointer", fontFamily: "var(--font-body, sans-serif)" }}
              >
                <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
                  <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
                  <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
                  <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
                </svg>
                {googleLoading
                  ? "Redirecting…"
                  : isLogin
                  ? "Sign in with Google"
                  : "Sign up with Google"}
              </button>
            </div>

            <p style={{ textAlign: "center", fontSize: "calc(13px * var(--font-scale))", color: "var(--text-muted)", margin: 0 }}>
              {isLogin ? "Don't have an account? " : "Already have an account? "}
              <button type="button" onClick={() => switchMode(isLogin ? "signup" : "login")} className="text-link" style={{ ...linkButtonStyle, color: "var(--primary)", fontWeight: 600, fontSize: "calc(13px * var(--font-scale))" }}>
                {isLogin ? "Sign up free" : "Log in"}
              </button>
            </p>

            {/* Passive resend affordance — always visible so it doesn't signal account existence */}
            {isLogin && (
              <p style={{ textAlign: "center", fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", marginTop: 8, marginBottom: 0 }}>
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
            )}

          </div>

          <p style={{ textAlign: "center", fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", marginTop: 14 }}>
            {isLogin
              ? "3 free Capycoins included when you sign up. No card required."
              : "By signing up you agree to our Terms of Service and Privacy Policy."}
          </p>

        </div>
      </div>

    </main>
  );
}
