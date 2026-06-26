"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { App, Routes, TableNames, Validation } from "@/lib/contracts";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const ONBOARDING_NAME_KEY = "cm_onb_fullName";
const ONBOARDING_CONSENT_KEY = "cm_onb_consent";

export default function OnboardingNamePage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");

  // Consent is only collected here for the Google-via-login edge: a user who
  // signed in with Google never saw the signup consent checkbox, so their
  // profile still has consent_deepseek = false. Email signups and consent-gated
  // Google signups already consented, so this checkbox stays hidden for them.
  const [needsConsent, setNeedsConsent] = useState(false);
  const [consent, setConsent] = useState(false);

  // Prefill the name (Google provides it) and decide whether to show consent.
  useEffect(() => {
    async function loadProfile() {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from(TableNames.profiles)
        .select("full_name, consent_deepseek")
        .eq("id", user.id)
        .single();
      if (data?.full_name) setFullName((prev) => prev || data.full_name);
      if (data && data.consent_deepseek === false) setNeedsConsent(true);
    }
    loadProfile();
  }, []);

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
    if (needsConsent && !consent) {
      setError("You must agree to AI processing to use Crammable.");
      return;
    }
    localStorage.setItem(ONBOARDING_NAME_KEY, trimmed);
    // The course step persists the profile; carry the consent decision there so
    // it's written in the same claim-profile-complete call.
    if (needsConsent && consent) localStorage.setItem(ONBOARDING_CONSENT_KEY, "1");
    router.push(Routes.onboardingCourse);
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

            {needsConsent && (
              <div style={{ background: "var(--bg-subtle)", border: "1.5px solid var(--border)", borderRadius: 12, padding: 13, marginTop: 8 }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                  <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setError(""); }} style={{ marginTop: 2, width: 16, height: 16, accentColor: "var(--primary)", flexShrink: 0 }} />
                  <span style={{ fontSize: "calc(12.5px * var(--font-scale))", color: "var(--text)", lineHeight: 1.5, textAlign: "left" }}>
                    <strong>I understand and agree</strong> that my uploaded documents will be processed by DeepSeek AI to generate flashcards. I will not upload sensitive or confidential information.{" "}
                    <span style={{ color: "var(--primary)" }}>*</span>
                  </span>
                </label>
              </div>
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
