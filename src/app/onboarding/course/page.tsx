"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiPaths,
  Validation,
  type ApiResponse,
  type ClaimProfileCompleteResult,
} from "@/lib/contracts";
import { authHeaders } from "@/lib/api/auth-headers";

const ONBOARDING_NAME_KEY = "cm_onb_fullName";
const ONBOARDING_CONSENT_KEY = "cm_onb_consent";

export default function OnboardingCoursePage() {
  const router = useRouter();
  const [fullName, setFullName] = useState<string | null>(null);
  const [course, setCourse] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [awarded, setAwarded] = useState(0);

  useEffect(() => {
    const stored = localStorage.getItem(ONBOARDING_NAME_KEY);
    if (!stored) {
      // Came here directly without the name step — send them back first.
      router.replace("/onboarding/name");
      return;
    }
    setFullName(stored);
  }, [router]);

  async function handleContinue(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = course.trim();
    if (!trimmed) {
      setError("Please enter your course or program.");
      return;
    }
    if (trimmed.length > Validation.profile.courseMaxLength) {
      setError(`Course must be ${Validation.profile.courseMaxLength} characters or fewer.`);
      return;
    }

    setSaving(true);
    setError("");
    // Carried from the name step for the Google-via-login edge — when set, the
    // user just consented to AI processing, so persist it with the profile.
    const consentDeepseek = localStorage.getItem(ONBOARDING_CONSENT_KEY) === "1";
    try {
      const res = await fetch(ApiPaths.claimProfileComplete, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) } as HeadersInit,
        body: JSON.stringify({
          fullName: fullName ?? "",
          course: trimmed,
          ...(consentDeepseek ? { consentDeepseek: true } : {}),
        }),
      });
      const data = (await res.json()) as ApiResponse<ClaimProfileCompleteResult>;
      if (!data.success) {
        setError(data.error.message);
        setSaving(false);
        return;
      }
      localStorage.removeItem(ONBOARDING_NAME_KEY);
      localStorage.removeItem(ONBOARDING_CONSENT_KEY);
      if (data.creditsAwarded > 0) {
        setAwarded(data.creditsAwarded);
        setTimeout(() => router.push("/onboarding/referral"), 900);
      } else {
        router.push("/onboarding/referral");
      }
    } catch {
      setError("Couldn't save that right now. Please try again.");
      setSaving(false);
    }
  }

  if (fullName === null) return null;

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-body, sans-serif)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: 24, padding: 32, boxShadow: "0 10px 28px rgba(0,0,0,0.12)" }}>

          <p style={{ textAlign: "center", fontSize: "calc(12px * var(--font-scale))", fontWeight: 600, color: "var(--primary)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
            Step 2 of 3
          </p>

          {awarded > 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ fontSize: "calc(40px * var(--font-scale))", marginBottom: 8 }}>🎉</div>
              <p style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(18px * var(--font-scale))", fontWeight: 700, color: "var(--text)" }}>
                +{awarded} Capycoins for completing your profile!
              </p>
            </div>
          ) : (
            <>
              <h1 style={{ textAlign: "center", fontFamily: "var(--font-display, serif)", fontSize: "calc(23px * var(--font-scale))", fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
                What&apos;s your course or program, {fullName.split(" ")[0]}?
              </h1>
              <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "calc(13px * var(--font-scale))", marginBottom: 24 }}>
                Helps us tailor flashcards and quizzes to your field.
              </p>

              <form onSubmit={handleContinue}>
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. BS Nursing, BS Computer Science"
                  value={course}
                  onChange={(e) => { setCourse(e.target.value); setError(""); }}
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
                  disabled={saving}
                  style={{ width: "100%", padding: "12px 0", marginTop: 8, background: saving ? "var(--primary-hover)" : "var(--primary)", color: "var(--nav-text)", border: "none", borderRadius: 10, fontSize: "calc(15px * var(--font-scale))", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", fontFamily: "var(--font-body, sans-serif)" }}
                >
                  {saving ? "Saving…" : "Continue"}
                </button>
              </form>
            </>
          )}

        </div>
      </div>
    </main>
  );
}
