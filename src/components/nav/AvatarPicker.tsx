"use client";

import { useRef, useState } from "react";
import { DEFAULT_AVATAR_SRC, readImageAsSquareDataUrl, useCustomAvatar } from "@/lib/theme/customAvatar";

// Nav-bar avatar circle with a hover-reveal "change profile picture" control.
// localStorage-only — see useCustomAvatar. No backend storage/schema exists
// for a custom avatar yet, so this never touches Supabase.
export function AvatarPicker() {
  const [avatarSrc, setAvatarSrc, resetAvatar] = useCustomAvatar();
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await readImageAsSquareDataUrl(file);
      setAvatarSrc(dataUrl);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not use that image.");
    }
  }

  return (
    <div className="avatar-wrap">
      <img
        className="avatar-pic"
        src={avatarSrc}
        alt="Your profile picture"
        width={32}
        height={32}
      />
      <div className="avatar-tooltip">
        <div style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,252,247,0.35)" }}>
          PROFILE PICTURE
        </div>

        <img
          src={avatarSrc}
          alt=""
          width={56}
          height={56}
          style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", alignSelf: "center" }}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={{
            background: "var(--primary)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "7px 12px",
            fontSize: "0.78rem",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "var(--font-body, sans-serif)",
          }}
        >
          Change profile picture
        </button>

        {avatarSrc !== DEFAULT_AVATAR_SRC && (
          <button
            type="button"
            onClick={() => { resetAvatar(); setError(""); }}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,252,247,0.6)",
              fontSize: "0.72rem",
              fontWeight: 600,
              cursor: "pointer",
              padding: 0,
              textDecoration: "underline",
              fontFamily: "var(--font-body, sans-serif)",
            }}
          >
            Use default Capy
          </button>
        )}

        {error && (
          <div style={{ fontSize: "0.72rem", color: "var(--error, #d65a4a)" }}>{error}</div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          onChange={handleFileSelected}
          style={{ display: "none" }}
        />
      </div>
    </div>
  );
}
