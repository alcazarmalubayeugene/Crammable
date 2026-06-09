"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  App,
  Routes,
  SubscriptionTier,
  TableNames,
  Validation,
} from "@/lib/contracts";

interface MinProfile {
  email: string;
  full_name: string | null;
  course: string | null;
  subscription_tier: string;
  token_balance: number;
  referral_code: string;
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<MinProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // editable fields
  const [fullName, setFullName] = useState("");
  const [course, setCourse] = useState("");

  // save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // logout state
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = Routes.login;
        return;
      }

      const { data } = await supabase
        .from(TableNames.profiles)
        .select("email, full_name, course, subscription_tier, token_balance, referral_code")
        .eq("id", user.id)
        .single();

      const p = data as MinProfile | null;
      setProfile(p);
      setFullName(p?.full_name ?? "");
      setCourse(p?.course ?? "");
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    if (fullName.length > Validation.profile.fullNameMaxLength) {
      setSaveError(`Name must be ${Validation.profile.fullNameMaxLength} characters or less.`);
      return;
    }
    if (course.length > Validation.profile.courseMaxLength) {
      setSaveError(`Course must be ${Validation.profile.courseMaxLength} characters or less.`);
      return;
    }

    setSaving(true);
    setSaveError("");
    setSaveSuccess(false);

    const supabase = getSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) { window.location.href = Routes.login; return; }

    const { error } = await supabase
      .from(TableNames.profiles)
      .update({ full_name: fullName.trim() || null, course: course.trim() || null })
      .eq("id", user.id);

    setSaving(false);
    if (error) {
      setSaveError("Failed to save. Please try again.");
      return;
    }

    setProfile((p) => p ? { ...p, full_name: fullName.trim() || null, course: course.trim() || null } : p);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  }

  async function handleLogout() {
    if (!confirm("Sign out of Crammable?")) return;
    setLoggingOut(true);
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.replace(Routes.home);
  }

  // ── loading ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#FAF2E4",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ color: "#8A6E52", fontFamily: "var(--font-dm-sans, sans-serif)" }}>
          Loading…
        </p>
      </main>
    );
  }

  const isPro = profile?.subscription_tier === SubscriptionTier.PRO;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#FAF2E4",
        fontFamily: "var(--font-dm-sans, sans-serif)",
      }}
    >
      {/* ── NAVBAR ── */}
      <nav
        style={{
          background: "#2E1A0C",
          borderBottom: "1px solid #4A2512",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 24px",
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <a
              href={Routes.dashboard}
              style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}
            >
              <span style={{ fontSize: 14, color: "#C49A6C" }}>← Back</span>
            </a>
            <span style={{ color: "#4A2512", margin: "0 8px" }}>|</span>
            <span style={{ fontSize: 24 }}>🦫</span>
            <span
              style={{
                fontFamily: "var(--font-lora, serif)",
                fontWeight: 700,
                fontSize: 18,
                color: "#FAF2E4",
              }}
            >
              {App.name}
            </span>
          </div>
          <span style={{ fontSize: 13, color: "#C49A6C" }}>Settings</span>
        </div>
      </nav>

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: 580, margin: "0 auto", padding: "40px 24px 64px" }}>

        <h1
          style={{
            fontFamily: "var(--font-lora, serif)",
            fontSize: 26,
            fontWeight: 700,
            color: "#2E1A0C",
            marginBottom: 28,
          }}
        >
          Settings
        </h1>

        {/* ── Account info (read-only) ── */}
        <div
          style={{
            background: "#FFFCF7",
            border: "1.5px solid #E0C9A8",
            borderRadius: 16,
            padding: "20px 22px",
            marginBottom: 16,
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "#C49A6C",
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            Account
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Row label="Email" value={profile?.email ?? "—"} />
            <Row
              label="Plan"
              value={
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: isPro ? "#C47A2E" : "#8A6E52",
                  }}
                >
                  {isPro ? "Pro ✓" : "Free"}
                </span>
              }
            />
            <Row label="Credits" value={`${profile?.token_balance ?? 0}`} />
            <Row label="Referral code" value={profile?.referral_code ?? "—"} mono />
          </div>

          {!isPro && (
            <a
              href={Routes.upgrade}
              style={{
                display: "inline-block",
                marginTop: 14,
                background: "#C47A2E",
                color: "#FAF2E4",
                padding: "9px 20px",
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 13,
                textDecoration: "none",
              }}
            >
              Upgrade to Pro →
            </a>
          )}
        </div>

        {/* ── Edit profile ── */}
        <div
          style={{
            background: "#FFFCF7",
            border: "1.5px solid #E0C9A8",
            borderRadius: 16,
            padding: "20px 22px",
            marginBottom: 16,
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "#C49A6C",
              textTransform: "uppercase",
              marginBottom: 16,
            }}
          >
            Profile
          </p>

          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#2E1A0C", marginBottom: 5 }}>
                Full name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={Validation.profile.fullNameMaxLength}
                placeholder="e.g. Yujin Ibanez"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#2E1A0C", marginBottom: 5 }}>
                Course / Program
              </label>
              <input
                type="text"
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                maxLength={Validation.profile.courseMaxLength}
                placeholder="e.g. BS Information Technology"
                style={inputStyle}
              />
            </div>

            {saveError && (
              <p style={{ fontSize: 13, color: "#EF4444", margin: 0 }}>{saveError}</p>
            )}
            {saveSuccess && (
              <p style={{ fontSize: 13, color: "#5C7A35", fontWeight: 600, margin: 0 }}>
                ✓ Profile saved!
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              style={{
                alignSelf: "flex-start",
                background: saving ? "#C49A6C" : "#C47A2E",
                color: "#FAF2E4",
                border: "none",
                borderRadius: 8,
                padding: "10px 24px",
                fontSize: 14,
                fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer",
                fontFamily: "var(--font-dm-sans, sans-serif)",
              }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </form>
        </div>

        {/* ── Danger zone ── */}
        <div
          style={{
            background: "#FFFCF7",
            border: "1.5px solid #E0C9A8",
            borderRadius: 16,
            padding: "20px 22px",
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "#C49A6C",
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            Session
          </p>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            style={{
              background: "none",
              border: "1.5px solid #E0C9A8",
              borderRadius: 8,
              padding: "9px 20px",
              fontSize: 13,
              fontWeight: 600,
              color: "#8A6E52",
              cursor: loggingOut ? "not-allowed" : "pointer",
              fontFamily: "var(--font-dm-sans, sans-serif)",
            }}
          >
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </main>
  );
}

// ── small helpers ─────────────────────────────────────────────────────────────

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontSize: 13, color: "#8A6E52" }}>{label}</span>
      <span
        style={{
          fontSize: 13,
          color: "#2E1A0C",
          fontWeight: 500,
          fontFamily: mono ? "monospace" : undefined,
          letterSpacing: mono ? "0.06em" : undefined,
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#FAF2E4",
  border: "1.5px solid #E0C9A8",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14,
  color: "#2E1A0C",
  fontFamily: "var(--font-dm-sans, sans-serif)",
  outline: "none",
};
