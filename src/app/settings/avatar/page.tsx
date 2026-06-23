"use client";

import { useRef, useState } from "react";
import { App, Routes, UIMessages } from "@/lib/contracts";
import { DEFAULT_AVATAR_SRC, readImageAsSquareDataUrl, useCustomAvatar } from "@/lib/theme/customAvatar";

const tapeStyle = (rotate: number): React.CSSProperties => ({
  position: "absolute",
  left: "50%",
  top: "50%",
  width: "150%",
  height: 30,
  background: "rgba(235, 211, 165, 0.92)",
  boxShadow: "0 2px 8px rgba(46,26,12,0.18)",
  transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

export default function AvatarSettingsPage() {
  const [avatarSrc, setAvatarSrc, resetAvatar] = useCustomAvatar();
  const [error, setError] = useState("");
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isCustom = avatarSrc !== DEFAULT_AVATAR_SRC;

  // Picking a file only stages a preview — it doesn't touch the live avatar
  // until "Save changes" is clicked, so a bad crop/wrong file is easy to back
  // out of with "Cancel" instead of having already overwritten the real one.
  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await readImageAsSquareDataUrl(file);
      setPreviewSrc(dataUrl);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not use that image.");
    }
  }

  function handleSavePreview() {
    if (!previewSrc) return;
    if (previewSrc === DEFAULT_AVATAR_SRC) {
      resetAvatar();
    } else {
      setAvatarSrc(previewSrc);
    }
    setPreviewSrc(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function handleCancelPreview() {
    setPreviewSrc(null);
    setError("");
  }

  // "Use default Capy" stages the same preview/confirm step as a real upload —
  // a one-click revert that wipes a custom photo is too easy to hit by
  // accident, so it goes through "Save changes" / "Cancel" too.
  function handleRequestDefault() {
    setPreviewSrc(DEFAULT_AVATAR_SRC);
    setError("");
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-body, sans-serif)" }}>
      {/* ── NAVBAR ── */}
      <nav style={{ background: "var(--nav-bg)", borderBottom: "1px solid var(--nav-border)", position: "sticky", top: 0, zIndex: 50 }}>
        <div className="nav-row" style={{ maxWidth: "100%", margin: "0 auto", padding: "0 24px", minHeight: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <a href={Routes.settings} className="nav-link" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
              <span style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--text-faint)" }}>← Back</span>
            </a>
            <span style={{ color: "var(--nav-border)", margin: "0 8px" }}>|</span>
            <span style={{ fontFamily: "var(--font-display, serif)", fontWeight: 700, fontSize: "calc(18px * var(--font-scale))", color: "var(--nav-text)" }}>
              {App.name}
            </span>
          </div>
          <span style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--primary)", fontWeight: 700 }}>Avatar</span>
        </div>
      </nav>

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px 64px" }}>
        <h1 style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(26px * var(--font-scale))", fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
          Your Profile
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "calc(14px * var(--font-scale))", marginBottom: 28 }}>
          Pick a photo for your profile picture. Premade styles are on the way.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 20 }}>
          {/* ── Avatar styles — taped shut, coming soon ── */}
          <div
            className="anim-fade-up"
            style={{
              background: "var(--bg-card)",
              border: "1.5px solid var(--border)",
              borderRadius: 16,
              padding: "20px 22px",
            }}
          >
            <p style={{ fontSize: "calc(11px * var(--font-scale))", fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 14 }}>
              Avatar styles
            </p>

            <span className="tooltip-wrap" style={{ display: "block", width: 260, margin: "0 auto" }} title={UIMessages.avatarStylesUnavailable}>
              <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)", cursor: "not-allowed" }}>
                <img
                  src="/capy/avatar-styles-grid.png"
                  alt="Planned avatar style set — AI-generated capybara stickers"
                  width={640}
                  height={960}
                  style={{ width: 260, height: "auto", display: "block", filter: "grayscale(0.25)", opacity: 0.7 }}
                />

                {/* Tape X — purely decorative, signals "not ready yet" without
                    needing a real disabled-state per thumbnail. */}
                <div style={tapeStyle(45)} />
                <div style={tapeStyle(-45)}>
                  <span
                    style={{
                      fontFamily: "var(--font-display, serif)",
                      fontWeight: 700,
                      fontSize: "calc(11px * var(--font-scale))",
                      letterSpacing: "0.1em",
                      color: "var(--text)",
                      textTransform: "uppercase",
                    }}
                  >
                    Coming soon
                  </span>
                </div>
              </div>
              <span className="tooltip-bubble">{UIMessages.avatarStylesUnavailable}</span>
            </span>

            <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-faint)", marginTop: 14, lineHeight: 1.6 }}>
              Planned: 9+ AI-generated Capy styles, unlockable with Capycoins, seasonal drops, and Pro-only variants.
            </p>
          </div>

          {/* ── Your current Capy — real upload ── */}
          <div
            className="anim-fade-up-1"
            style={{
              background: "var(--bg-card)",
              border: "1.5px solid var(--border)",
              borderRadius: 16,
              padding: "20px 22px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            <p style={{ alignSelf: "flex-start", fontSize: "calc(11px * var(--font-scale))", fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 14 }}>
              {previewSrc ? "Preview" : "Profile picture"}
            </p>

            <img
              src={previewSrc ?? avatarSrc}
              alt="Your profile picture"
              width={120}
              height={120}
              style={{
                width: 120,
                height: 120,
                borderRadius: "50%",
                objectFit: "cover",
                border: `2.5px solid ${previewSrc ? "var(--text-faint)" : "var(--primary)"}`,
                marginBottom: 10,
              }}
            />

            {previewSrc ? (
              <>
                <p style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-faint)", marginBottom: 18 }}>
                  {previewSrc === DEFAULT_AVATAR_SRC ? "Revert to default Capy — not saved yet" : "Previewing — not saved yet"}
                </p>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    onClick={handleSavePreview}
                    className="btn-solid"
                    style={{
                      background: "var(--primary)",
                      color: "var(--nav-text)",
                      border: "none",
                      borderRadius: 10,
                      padding: "11px 24px",
                      fontSize: "calc(14px * var(--font-scale))",
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "var(--font-body, sans-serif)",
                    }}
                  >
                    Save changes
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelPreview}
                    style={{
                      background: "none",
                      border: "1.5px solid var(--border)",
                      borderRadius: 10,
                      padding: "11px 20px",
                      color: "var(--text-muted)",
                      fontSize: "calc(14px * var(--font-scale))",
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "var(--font-body, sans-serif)",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-muted)", marginBottom: 18 }}>
                  {isCustom ? "Custom photo" : "Default avatar"}
                </p>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-solid"
                  style={{
                    background: "var(--primary)",
                    color: "var(--nav-text)",
                    border: "none",
                    borderRadius: 10,
                    padding: "11px 24px",
                    fontSize: "calc(14px * var(--font-scale))",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "var(--font-body, sans-serif)",
                    marginBottom: 10,
                  }}
                >
                  Upload PNG or JPG
                </button>

                {isCustom && (
                  <button
                    type="button"
                    onClick={handleRequestDefault}
                    className="text-link"
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      fontSize: "calc(12px * var(--font-scale))",
                      fontWeight: 600,
                      cursor: "pointer",
                      textDecoration: "underline",
                      fontFamily: "var(--font-body, sans-serif)",
                    }}
                  >
                    Use default Capy
                  </button>
                )}

                {saved && (
                  <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--success)", fontWeight: 600, marginTop: 10 }}>
                    ✓ Saved!
                  </p>
                )}
              </>
            )}

            {error && (
              <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--error)", marginTop: 10 }}>{error}</p>
            )}

            <p style={{ fontSize: "calc(11px * var(--font-scale))", color: "var(--text-faint)", marginTop: 14, lineHeight: 1.5 }}>
              Cropped to a circle automatically. PNG or JPG, up to 5MB. Saved on this device only.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleFileSelected}
              style={{ display: "none" }}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
