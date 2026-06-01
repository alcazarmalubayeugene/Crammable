"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/auth/login", {
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

    // Login successful — redirect to dashboard
    window.location.href = "/dashboard";
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
          <a href="/signup" style={{ fontSize: 13, color: "#C49A6C", textDecoration: "none" }}>
            No account yet?{" "}
            <span style={{ color: "#C47A2E", fontWeight: 600 }}>Sign up free</span>
          </a>
        </div>
      </nav>

      {/* ── LOGIN CARD ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 64px)", padding: "40px 24px" }}>
        <div style={{ width: "100%", maxWidth: 420 }}>

          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🦫</div>
            <h1 style={{ fontFamily: "var(--font-lora, serif)", fontSize: 26, fontWeight: 700, color: "#2E1A0C", marginBottom: 6 }}>
              Welcome back
            </h1>
            <p style={{ color: "#8A6E52", fontSize: 14 }}>
              Log in to your Crammable account
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
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#2E1A0C", marginBottom: 6 }}>
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
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#2E1A0C", marginBottom: 6 }}>
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
                <a href="/forgot-password" style={{ fontSize: 12, color: "#C47A2E", textDecoration: "none" }}>
                  Forgot password?
                </a>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{ width: "100%", padding: "12px 0", background: loading ? "#A86826" : "#C47A2E", color: "#FAF2E4", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", fontFamily: "var(--font-dm-sans, sans-serif)" }}
              >
                {loading ? "Logging in…" : "Log in"}
              </button>

            </form>

            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0" }}>
              <div style={{ flex: 1, height: 1, background: "#E0C9A8" }} />
              <span style={{ fontSize: 12, color: "#8A6E52" }}>or</span>
              <div style={{ flex: 1, height: 1, background: "#E0C9A8" }} />
            </div>

            <p style={{ textAlign: "center", fontSize: 13, color: "#8A6E52", margin: 0 }}>
              Don&apos;t have an account?{" "}
              <a href="/signup" style={{ color: "#C47A2E", fontWeight: 600, textDecoration: "none" }}>
                Sign up free
              </a>
            </p>

          </div>

          <p style={{ textAlign: "center", fontSize: 12, color: "#8A6E52", marginTop: 20 }}>
            3 free credits included when you sign up. No card required.
          </p>

        </div>
      </div>

    </main>
  );
}
