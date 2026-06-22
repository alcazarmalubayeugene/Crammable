"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { App, Validation } from "@/lib/contracts";

const ONBOARDING_NAME_KEY = "cm_onb_fullName";

export default function OnboardingNamePage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");

  function handleContinue(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = fullName.trim();
    if (!trimmed) {
      setError("Please enter your name.");
      return;
    }
    if (trimmed.length > Validation.profile.fullNameMaxLength) {
      setError(`Name must be ${Validation.profile.fullNameMaxLength} characters or fewer.`);
      return;
    }
    localStorage.setItem(ONBOARDING_NAME_KEY, trimmed);
    router.push("/onboarding/course");
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-body, sans-serif)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: 24, padding: 32, boxShadow: "0 10px 28px rgba(0,0,0,0.12)" }}>

          <p style={{ textAlign: "center", fontSize: "calc(12px * var(--font-scale))", fontWeight: 600, color: "var(--primary)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
            Step 1 of 3
          </p>

          <h1 style={{ textAlign: "center", fontFamily: "var(--font-display, serif)", fontSize: "calc(23px * var(--font-scale))", fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
            What&apos;s your full name?
          </h1>
          <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "calc(13px * var(--font-scale))", marginBottom: 24 }}>
            We&apos;ll use this to personalize your {App.name} dashboard.
          </p>

          <form onSubmit={handleContinue}>
            <input
              type="text"
              autoFocus
              placeholder="Juan dela Cruz"
              value={fullName}
              onChange={(e) => { setFullName(e.target.value); setError(""); }}
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
                marginBottom: 8,
              }}
            />
            {error && (
              <p style={{ color: "var(--error-dark)", fontSize: "calc(12px * var(--font-scale))", marginBottom: 8 }}>{error}</p>
            )}

            <button
              type="submit"
              style={{ width: "100%", padding: "12px 0", marginTop: 8, background: "var(--primary)", color: "var(--nav-text)", border: "none", borderRadius: 10, fontSize: "calc(15px * var(--font-scale))", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body, sans-serif)" }}
            >
              Continue
            </button>
          </form>

        </div>
      </div>
    </main>
  );
}
