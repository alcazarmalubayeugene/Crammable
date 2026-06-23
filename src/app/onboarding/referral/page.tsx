"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiPaths,
  Routes,
  UIMessages,
  Validation,
  type ApiResponse,
  type ClaimReferralResult,
} from "@/lib/contracts";
import { authHeaders } from "@/lib/api/auth-headers";

const ONBOARDING_PENDING_KEY = "cm_pending_onboarding";

export default function OnboardingReferralPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [thanks, setThanks] = useState("");
  const [claiming, setClaiming] = useState(false);

  function finish() {
    localStorage.removeItem(ONBOARDING_PENDING_KEY);
    router.push(Routes.dashboard);
  }

  async function handleClaim(e: React.FormEvent) {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (clean.length !== Validation.referralCode.length) {
      setError(`Code must be ${Validation.referralCode.length} characters.`);
      return;
    }
    setError("");
    setClaiming(true);
    try {
      const res = await fetch(ApiPaths.claimReferral, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) } as HeadersInit,
        body: JSON.stringify({ referralCode: clean }),
      });
      const data = (await res.json()) as ApiResponse<ClaimReferralResult>;
      if (!data.success) {
        setError(data.error.message);
        setClaiming(false);
        return;
      }
      setThanks(UIMessages.referralClaimThanks(data.creditsAwarded));
      setTimeout(finish, 1200);
    } catch {
      setError("Couldn't claim that right now. Please try again.");
      setClaiming(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-body, sans-serif)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: 24, padding: 32, boxShadow: "0 10px 28px rgba(0,0,0,0.12)" }}>

          <p style={{ textAlign: "center", fontSize: "calc(12px * var(--font-scale))", fontWeight: 600, color: "var(--primary)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
            Step 3 of 3
          </p>

          {thanks ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ fontSize: "calc(40px * var(--font-scale))", marginBottom: 8 }}>🎁</div>
              <p style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(16px * var(--font-scale))", fontWeight: 700, color: "var(--text)" }}>
                {thanks}
              </p>
            </div>
          ) : (
            <>
              <h1 style={{ textAlign: "center", fontFamily: "var(--font-display, serif)", fontSize: "calc(23px * var(--font-scale))", fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
                Got a referral code?
              </h1>
              <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "calc(13px * var(--font-scale))", marginBottom: 24 }}>
                Enter a friend&apos;s code and they&apos;ll earn Capycoins for referring you.
              </p>

              <form onSubmit={handleClaim}>
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. AB12CD34"
                  value={code}
                  onChange={(e) => {
                    const clean = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, Validation.referralCode.length);
                    setCode(clean);
                    setError("");
                  }}
                  maxLength={Validation.referralCode.length}
                  style={{
                    width: "100%",
                    padding: "11px 14px",
                    background: "var(--bg)",
                    border: `1.5px solid ${error ? "var(--error)" : "var(--border)"}`,
                    borderRadius: 10,
                    fontSize: "calc(14px * var(--font-scale))",
                    color: "var(--text)",
                    outline: "none",
                    boxSizing: "border-box",
                    fontFamily: "var(--font-body, sans-serif)",
                    letterSpacing: "0.08em",
                    marginBottom: 8,
                  }}
                />
                {error && (
                  <p style={{ color: "var(--error-dark)", fontSize: "calc(12px * var(--font-scale))", marginBottom: 8 }}>{error}</p>
                )}

                <button
                  type="submit"
                  disabled={claiming || !code}
                  style={{ width: "100%", padding: "12px 0", marginTop: 8, background: claiming ? "var(--primary-hover)" : "var(--primary)", color: "var(--nav-text)", border: "none", borderRadius: 10, fontSize: "calc(15px * var(--font-scale))", fontWeight: 600, cursor: claiming || !code ? "not-allowed" : "pointer", fontFamily: "var(--font-body, sans-serif)" }}
                >
                  {claiming ? "Claiming…" : "Claim & finish"}
                </button>

                <button
                  type="button"
                  onClick={finish}
                  disabled={claiming}
                  style={{ width: "100%", padding: "10px 0", marginTop: 10, background: "none", border: "none", color: "var(--text-muted)", fontSize: "calc(13px * var(--font-scale))", cursor: claiming ? "not-allowed" : "pointer", fontFamily: "var(--font-body, sans-serif)", textDecoration: "underline" }}
                >
                  Skip for now
                </button>
              </form>
            </>
          )}

        </div>
      </div>
    </main>
  );
}
