"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { authHeaders } from "@/lib/api/auth-headers";
import { useTheme, FONT_SIZE_LABELS, FONT_PAIRS, type ThemeMode, type FontSizeKey, type FontPairKey } from "@/lib/theme/ThemeProvider";
import { PageLoading } from "@/components/ui/PageLoading";
import {
  ApiErrorCode,
  ApiPaths,
  Routes,
  SubscriptionTier,
  TableNames,
  UIMessages,
  Validation,
  type ApiResponse,
  type ClaimProfileCompleteResult,
} from "@/lib/contracts";
import { Navbar } from "@/components/nav/Navbar";

interface MinProfile {
  email: string;
  full_name: string | null;
  course: string | null;
  subscription_tier: string;
  token_balance: number;
  referral_code: string;
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const isResetMode = searchParams.get("mode") === "reset-password";
  const {
    theme, setTheme, previewTheme,
    fontSize, setFontSize, previewFontSize,
    fontPair, setFontPair, previewFontPair,
  } = useTheme();

  // Drafts preview live (so you can see the change) but only persist on
  // "Save preferences" — leaving the page without saving reverts the preview.
  const [draftTheme, setDraftTheme] = useState<ThemeMode>(theme);
  const [draftFontSize, setDraftFontSize] = useState<FontSizeKey>(fontSize);
  const [draftFontPair, setDraftFontPair] = useState<FontPairKey>(fontPair);
  const [styleSaved, setStyleSaved] = useState(false);
  const savedStyleRef = useRef({ theme, fontSize, fontPair });

  useEffect(() => {
    savedStyleRef.current = { theme, fontSize, fontPair };
    setDraftTheme(theme);
    setDraftFontSize(fontSize);
    setDraftFontPair(fontPair);
  }, [theme, fontSize, fontPair]);

  useEffect(() => {
    return () => {
      const saved = savedStyleRef.current;
      previewTheme(saved.theme);
      previewFontSize(saved.fontSize);
      previewFontPair(saved.fontPair);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasUnsavedStyleChanges =
    draftTheme !== theme || draftFontSize !== fontSize || draftFontPair !== fontPair;

  function handleSaveStyle() {
    setTheme(draftTheme);
    setFontSize(draftFontSize);
    setFontPair(draftFontPair);
    setStyleSaved(true);
    setTimeout(() => setStyleSaved(false), 3000);

    // Sync to the profile so prefs follow the user across devices. Fire-and-forget:
    // localStorage (set above) is the local source of truth, so a failed sync
    // never blocks the save or shows an error — it just won't propagate to other
    // devices until the next successful save.
    fetch(ApiPaths.updatePreferences, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: draftTheme, fontSize: draftFontSize, fontPair: draftFontPair }),
    }).catch(() => {});
  }

  const [profile, setProfile] = useState<MinProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // editable fields
  const [fullName, setFullName] = useState("");
  const [course, setCourse] = useState("");

  // save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [creditsAwarded, setCreditsAwarded] = useState(0);

  // logout state
  const [loggingOut, setLoggingOut] = useState(false);

  // delete account state (E5)
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // reset-password mode state (?mode=reset-password)
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetExpired, setResetExpired] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  useEffect(() => {
    if (isResetMode) return; // reset mode renders its own form — no profile needed
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
  }, [isResetMode]);

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
    setCreditsAwarded(0);

    const supabase = getSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) { window.location.href = Routes.login; return; }

    let data: ApiResponse<ClaimProfileCompleteResult>;
    try {
      const res = await fetch(ApiPaths.claimProfileComplete, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        } as HeadersInit,
        body: JSON.stringify({ fullName: fullName.trim(), course: course.trim() }),
      });
      data = await res.json();
    } catch {
      setSaving(false);
      setSaveError("Failed to save. Please try again.");
      return;
    }

    setSaving(false);
    if (!data.success) {
      setSaveError(data.error.message);
      return;
    }

    setProfile((p) => p ? { ...p, full_name: data.fullName, course: data.course, token_balance: data.newBalance } : p);
    setSaveSuccess(true);
    if (data.creditsAwarded > 0) setCreditsAwarded(data.creditsAwarded);
    setTimeout(() => setSaveSuccess(false), 3000);
  }

  async function handleLogout() {
    if (!confirm("Log out of Crammable on all devices?")) return;
    setLoggingOut(true);
    const supabase = getSupabaseBrowserClient();
    // scope: "global" signs out every session for this user, not just this
    // device — already supabase-js's default, but explicit here since the
    // button now promises that behavior.
    await supabase.auth.signOut({ scope: "global" });
    window.location.replace(Routes.home);
  }

  async function handleDeleteAccount() {
    if (!confirm(UIMessages.accountDeleteConfirm)) return;
    if (!confirm("Are you absolutely sure? This is your last chance to cancel.")) return;

    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch(ApiPaths.accountDelete, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        } as HeadersInit,
      });
      const data = (await res.json()) as ApiResponse<never>;
      if (!data.success) {
        setDeleting(false);
        setDeleteError(data.error.message);
        return;
      }
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
      alert(UIMessages.accountDeleted);
      window.location.replace(Routes.home);
    } catch {
      setDeleting(false);
      setDeleteError(UIMessages.genericError);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setResetError("");
    setResetExpired(false);

    if (newPassword.length < 8) {
      setResetError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError("Passwords don't match.");
      return;
    }

    setResetLoading(true);
    let data: { success: boolean; error?: { code: string; message: string } };
    try {
      const res = await fetch(ApiPaths.authResetPassword, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      data = await res.json();
    } catch {
      setResetLoading(false);
      setResetError("Something went wrong. Please try again.");
      return;
    }
    setResetLoading(false);

    if (data.success) {
      setResetDone(true);
      window.location.replace(Routes.dashboard);
      return;
    }

    // Expired/used link → the POST comes back UNAUTHORIZED (session lacks reset scope).
    if (data.error?.code === ApiErrorCode.UNAUTHORIZED) {
      setResetExpired(true);
      return;
    }

    // VALIDATION_ERROR (e.g. same as old password) surfaces its own message;
    // anything else falls back to a generic line.
    setResetError(data.error?.message ?? "Something went wrong. Please try again.");
  }

  // ── reset-password mode (?mode=reset-password) ─────────────────────────────────

  if (isResetMode) {
    return (
      <main style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-body, sans-serif)" }}>
        {/* ── NAVBAR ── */}
        <Navbar />

        {/* ── RESET CARD ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 64px)", padding: "40px 24px" }}>
          <div style={{ width: "100%", maxWidth: 420 }}>

            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <h1 style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(26px * var(--font-scale))", fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
                Set a new password
              </h1>
              <p style={{ color: "var(--text-muted)", fontSize: "calc(14px * var(--font-scale))" }}>
                You&apos;re almost in. Choose a new password for your account.
              </p>
            </div>

            <div style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: 20, padding: 32 }}>

              {resetDone ? (
                <p style={{ textAlign: "center", fontSize: "calc(14px * var(--font-scale))", color: "var(--success)", fontWeight: 600, margin: 0 }}>
                  Password updated! Redirecting…
                </p>
              ) : resetExpired ? (
                <div style={{ background: "var(--error-bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", fontSize: "calc(13px * var(--font-scale))", color: "var(--error-dark)", lineHeight: 1.6 }}>
                  Your reset link has expired.{" "}
                  <Link href={Routes.forgotPassword} style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "underline" }}>
                    Request a new one
                  </Link>
                  .
                </div>
              ) : (
                <>
                  {resetError && (
                    <div style={{ background: "var(--error-bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: "calc(13px * var(--font-scale))", color: "var(--error-dark)" }}>
                      {resetError}
                    </div>
                  )}

                  <form onSubmit={handleResetPassword}>
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ display: "block", fontSize: "calc(13px * var(--font-scale))", fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
                        New password
                      </label>
                      <PasswordInput
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        show={showPassword}
                        onToggle={() => setShowPassword((v) => !v)}
                      />
                    </div>

                    <div style={{ marginBottom: 20 }}>
                      <label style={{ display: "block", fontSize: "calc(13px * var(--font-scale))", fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
                        Confirm new password
                      </label>
                      <PasswordInput
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        show={showPassword}
                        onToggle={() => setShowPassword((v) => !v)}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={resetLoading}
                      style={{ width: "100%", padding: "12px 0", background: resetLoading ? "var(--primary-hover)" : "var(--primary)", color: "var(--nav-text)", border: "none", borderRadius: 10, fontSize: "calc(15px * var(--font-scale))", fontWeight: 600, cursor: resetLoading ? "not-allowed" : "pointer", fontFamily: "var(--font-body, sans-serif)" }}
                    >
                      {resetLoading ? "Updating…" : "Update password"}
                    </button>
                  </form>
                </>
              )}

            </div>
          </div>
        </div>
      </main>
    );
  }

  // ── loading ───────────────────────────────────────────────────────────────────

  if (loading) {
    return <PageLoading />;
  }

  const isPro = profile?.subscription_tier === SubscriptionTier.PRO;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        fontFamily: "var(--font-body, sans-serif)",
      }}
    >
      {/* ── NAVBAR ── */}
      <Navbar backHref={Routes.dashboard} sectionLabel="Settings" />

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: 580, margin: "0 auto", padding: "40px 24px 64px" }}>

        <h1
          style={{
            fontFamily: "var(--font-display, serif)",
            fontSize: "calc(26px * var(--font-scale))",
            fontWeight: 700,
            color: "var(--text)",
            marginBottom: 28,
          }}
        >
          Settings
        </h1>

        {/* ── Account info (read-only) ── */}
        <div
          className="anim-fade-up"
          style={{
            background: "var(--bg-card)",
            border: "1.5px solid var(--border)",
            borderRadius: 16,
            padding: "20px 22px",
            marginBottom: 16,
          }}
        >
          <p
            style={{
              fontSize: "calc(11px * var(--font-scale))",
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "var(--text-faint)",
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
                    fontSize: "calc(13px * var(--font-scale))",
                    fontWeight: 600,
                    color: isPro ? "var(--primary)" : "var(--text-muted)",
                  }}
                >
                  {isPro ? "Pro ✓" : "Free"}
                </span>
              }
            />
            <Row label="Capycoins" value={`${profile?.token_balance ?? 0}`} />
            <Row label="Referral code" value={profile?.referral_code ?? "—"} mono />
          </div>

          {!isPro && (
            <a
              href={Routes.upgrade}
              style={{
                display: "inline-block",
                marginTop: 14,
                background: "var(--primary)",
                color: "var(--nav-text)",
                padding: "9px 20px",
                borderRadius: 8,
                fontWeight: 600,
                fontSize: "calc(13px * var(--font-scale))",
                textDecoration: "none",
              }}
            >
              Upgrade to Pro →
            </a>
          )}
        </div>

        {/* ── Edit profile ── */}
        <div
          className="anim-fade-up-1"
          style={{
            background: "var(--bg-card)",
            border: "1.5px solid var(--border)",
            borderRadius: 16,
            padding: "20px 22px",
            marginBottom: 16,
          }}
        >
          <p
            style={{
              fontSize: "calc(11px * var(--font-scale))",
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "var(--text-faint)",
              textTransform: "uppercase",
              marginBottom: 16,
            }}
          >
            Profile
          </p>

          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: "calc(13px * var(--font-scale))", fontWeight: 600, color: "var(--text)", marginBottom: 5 }}>
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
              <label style={{ display: "block", fontSize: "calc(13px * var(--font-scale))", fontWeight: 600, color: "var(--text)", marginBottom: 5 }}>
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
              <p style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--error)", margin: 0 }}>{saveError}</p>
            )}
            {saveSuccess && (
              <p style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--success)", fontWeight: 600, margin: 0 }}>
                ✓ Profile saved!
                {creditsAwarded > 0 && ` +${creditsAwarded} Capycoins for completing your profile!`}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="btn-solid"
              style={{
                alignSelf: "flex-start",
                background: saving ? "var(--text-faint)" : "var(--primary)",
                color: "var(--nav-text)",
                border: "none",
                borderRadius: 8,
                padding: "10px 24px",
                fontSize: "calc(14px * var(--font-scale))",
                fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer",
                fontFamily: "var(--font-body, sans-serif)",
                transition: "background 0.15s ease",
              }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </form>
        </div>

        {/* ── Preferred style ── */}
        <div
          className="anim-fade-up-2"
          style={{
            background: "var(--bg-card)",
            border: "1.5px solid var(--border)",
            borderRadius: 16,
            padding: "20px 22px",
            marginBottom: 16,
          }}
        >
          <p
            style={{
              fontSize: "calc(11px * var(--font-scale))",
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "var(--text-faint)",
              textTransform: "uppercase",
              marginBottom: 16,
            }}
          >
            Preferred style
          </p>

          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontSize: "calc(13px * var(--font-scale))", fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
              Appearance
            </label>
            <div style={{ display: "inline-flex", border: "1.5px solid var(--border)", borderRadius: 10, padding: 3, gap: 2 }}>
              {(["light", "dark"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => { setDraftTheme(mode); previewTheme(mode); }}
                  className={`chip${draftTheme === mode ? " chip-active" : ""}`}
                  style={{
                    background: draftTheme === mode ? "var(--primary)" : "none",
                    color: draftTheme === mode ? "var(--on-primary)" : "var(--text-muted)",
                    border: "1.5px solid transparent",
                    borderRadius: 8,
                    padding: "7px 18px",
                    fontSize: "calc(13px * var(--font-scale))",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "var(--font-body, sans-serif)",
                    textTransform: "capitalize",
                  }}
                >
                  {mode === "light" ? "☀️ Light" : "🌙 Dark (default)"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "calc(13px * var(--font-scale))", fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
              Font size
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(Object.keys(FONT_SIZE_LABELS) as FontSizeKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setDraftFontSize(key); previewFontSize(key); }}
                  className={`chip${draftFontSize === key ? " chip-active" : ""}`}
                  style={{
                    background: draftFontSize === key ? "var(--primary)" : "none",
                    color: draftFontSize === key ? "var(--on-primary)" : "var(--text-muted)",
                    border: draftFontSize === key ? "1.5px solid var(--primary)" : "1.5px solid var(--border)",
                    borderRadius: 8,
                    padding: "7px 14px",
                    fontSize: "calc(13px * var(--font-scale))",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "var(--font-body, sans-serif)",
                  }}
                >
                  {FONT_SIZE_LABELS[key]}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <label style={{ display: "block", fontSize: "calc(13px * var(--font-scale))", fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
              Font
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(Object.keys(FONT_PAIRS) as FontPairKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setDraftFontPair(key); previewFontPair(key); }}
                  className={`chip${draftFontPair === key ? " chip-active" : ""}`}
                  style={{
                    background: draftFontPair === key ? "var(--primary)" : "none",
                    color: draftFontPair === key ? "var(--on-primary)" : "var(--text-muted)",
                    border: draftFontPair === key ? "1.5px solid var(--primary)" : "1.5px solid var(--border)",
                    borderRadius: 8,
                    padding: "7px 14px",
                    fontSize: "calc(13px * var(--font-scale))",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "var(--font-body, sans-serif)",
                  }}
                >
                  {FONT_PAIRS[key].label}{key === "baskerville" ? " (default)" : ""}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 12 }}>
            <button
              type="button"
              onClick={handleSaveStyle}
              disabled={!hasUnsavedStyleChanges}
              className="btn-solid"
              style={{
                background: hasUnsavedStyleChanges ? "var(--primary)" : "none",
                color: hasUnsavedStyleChanges ? "var(--on-primary)" : "var(--text-faint)",
                border: hasUnsavedStyleChanges ? "1.5px solid var(--primary)" : "1.5px solid var(--border)",
                borderRadius: 8,
                padding: "10px 24px",
                fontSize: "calc(14px * var(--font-scale))",
                fontWeight: 600,
                cursor: hasUnsavedStyleChanges ? "pointer" : "not-allowed",
                fontFamily: "var(--font-body, sans-serif)",
                transition: "all 0.15s ease",
              }}
            >
              Save preferences
            </button>
            {styleSaved ? (
              <p style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--success)", fontWeight: 600, margin: 0 }}>
                ✓ Preferences saved!
              </p>
            ) : hasUnsavedStyleChanges ? (
              <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-faint)", margin: 0 }}>
                Previewing — not saved yet
              </p>
            ) : (
              <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-faint)", margin: 0 }}>
                All changes saved
              </p>
            )}
          </div>
        </div>

        {/* ── Session ── */}
        <div
          className="anim-fade-up-3"
          style={{
            background: "var(--bg-card)",
            border: "1.5px solid var(--border)",
            borderRadius: 16,
            padding: "20px 22px",
            marginBottom: 16,
          }}
        >
          <p
            style={{
              fontSize: "calc(11px * var(--font-scale))",
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "var(--text-faint)",
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
            className="btn-outline"
            style={{
              background: "none",
              border: "1.5px solid var(--border)",
              borderRadius: 8,
              padding: "9px 20px",
              fontSize: "calc(13px * var(--font-scale))",
              fontWeight: 600,
              color: "var(--text-muted)",
              cursor: loggingOut ? "not-allowed" : "pointer",
              fontFamily: "var(--font-body, sans-serif)",
            }}
          >
            {loggingOut ? "Signing out…" : "Log out of all devices"}
          </button>
        </div>

        {/* ── Danger zone (delete account) ── */}
        <div
          className="anim-fade-up-4"
          style={{
            background: "var(--bg-card)",
            border: "1.5px solid var(--border)",
            borderRadius: 16,
            padding: "20px 22px",
            marginTop: 16,
          }}
        >
          <p
            style={{
              fontSize: "calc(11px * var(--font-scale))",
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "var(--error)",
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            Danger zone
          </p>

          <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", marginBottom: 10 }}>
            {UIMessages.accountDeleteConfirm}
          </p>
          <button
            type="button"
            onClick={handleDeleteAccount}
            disabled={deleting}
            className="btn-solid"
            style={{
              background: "var(--error)",
              border: "none",
              borderRadius: 8,
              padding: "9px 20px",
              fontSize: "calc(13px * var(--font-scale))",
              fontWeight: 600,
              color: "var(--nav-text)",
              cursor: deleting ? "not-allowed" : "pointer",
              fontFamily: "var(--font-body, sans-serif)",
            }}
          >
            {deleting ? "Deleting…" : "Delete my account"}
          </button>
          {deleteError && (
            <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--error)", marginTop: 8 }}>{deleteError}</p>
          )}
        </div>
      </div>
    </main>
  );
}

// useSearchParams must be wrapped in a Suspense boundary (Next.js requirement).
export default function SettingsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <SettingsContent />
    </Suspense>
  );
}

// ── small helpers ─────────────────────────────────────────────────────────────

function PasswordInput({
  value,
  onChange,
  placeholder,
  show,
  onToggle,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{ position: "relative" }}>
      <input
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        minLength={8}
        style={{ ...inputStyle, paddingRight: 44 }}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? "Hide password" : "Show password"}
        style={{
          position: "absolute",
          right: 6,
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 8,
          display: "flex",
          alignItems: "center",
          color: "var(--text-muted)",
        }}
      >
        {show ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

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
      <span style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-muted)" }}>{label}</span>
      <span
        style={{
          fontSize: "calc(13px * var(--font-scale))",
          color: "var(--text)",
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
  background: "var(--bg)",
  border: "1.5px solid var(--border)",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: "calc(14px * var(--font-scale))",
  color: "var(--text)",
  fontFamily: "var(--font-body, sans-serif)",
  outline: "none",
};
