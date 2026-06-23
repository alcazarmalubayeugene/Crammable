"use client";

import { useEffect, useRef, useState } from "react";
import { useCustomAvatar } from "@/lib/theme/customAvatar";
import { Routes } from "@/lib/contracts";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

// Nav-bar avatar circle with a click-toggled dropdown (was hover-revealed —
// switched to click since hover doesn't work on touch devices anyway, and
// Yujin specifically wanted click-to-open/click-again-to-close). "Change
// profile picture" links to a dedicated page (/settings/avatar) that hosts
// the real upload flow (with its own preview/confirm step), the "use
// default Capy" reset, and the "coming soon" avatar-style gallery — kept
// out of this dropdown so a one-click reset can't happen by accident.
// localStorage-only avatar, see useCustomAvatar.
//
// Settings + Log out live here (Gmail-style account-menu pattern: click the
// avatar, account actions are in that dropdown) instead of as separate nav
// links on every page — previously only dashboard.tsx had a Log out button,
// so decks/[id] and decks/new had no way to sign out without going back to
// the dashboard first. Self-contained sign-out here (not a prop) fixes that
// for every page that renders this component, not just dashboard.
//
// Email is fetched directly from the auth session here too (rather than
// passed as a prop from each page's own profile query) — same reasoning as
// handleLogout: keeps this component fully self-contained so it works
// identically wherever it's rendered.
export function AvatarPicker() {
  const [avatarSrc] = useCustomAvatar();
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  // Click anywhere outside the dropdown closes it — standard dropdown
  // behavior, and avoids it getting stuck open after a click toggle.
  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  async function handleLogout() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = Routes.home;
  }

  return (
    <div className="avatar-wrap" ref={wrapRef}>
      <img
        className="avatar-pic"
        src={avatarSrc}
        alt="Your profile picture"
        width={44}
        height={44}
        onClick={() => setOpen((o) => !o)}
      />
      <div className="avatar-tooltip" style={{ display: open ? "flex" : "none" }}>
        {email && (
          <div style={{ fontSize: "0.72rem", color: "rgba(255,252,247,0.6)", textAlign: "center", wordBreak: "break-all" }}>
            {email}
          </div>
        )}
        <div style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,252,247,0.35)" }}>
          PROFILE PICTURE
        </div>

        <img
          src={avatarSrc}
          alt=""
          width={72}
          height={72}
          style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", alignSelf: "center" }}
        />

        <a
          href={Routes.avatar}
          style={{
            display: "block",
            textAlign: "center",
            background: "var(--primary)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "7px 12px",
            fontSize: "0.78rem",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "var(--font-body, sans-serif)",
            textDecoration: "none",
          }}
        >
          Change profile picture
        </a>

        <div style={{ borderTop: "1px solid rgba(255,252,247,0.12)", margin: "2px 0" }} />

        <a
          href={Routes.settings}
          className="btn-outline"
          style={{
            display: "block",
            textAlign: "center",
            background: "rgba(255,252,247,0.06)",
            color: "rgba(255,252,247,0.9)",
            border: "1.5px solid rgba(255,252,247,0.18)",
            borderRadius: 8,
            padding: "7px 12px",
            fontSize: "0.78rem",
            fontWeight: 600,
            fontFamily: "var(--font-body, sans-serif)",
            textDecoration: "none",
          }}
        >
          Settings
        </a>
        <button
          type="button"
          onClick={handleLogout}
          className="btn-outline"
          style={{
            display: "block",
            width: "100%",
            textAlign: "center",
            background: "rgba(255,252,247,0.06)",
            color: "rgba(255,252,247,0.9)",
            border: "1.5px solid rgba(255,252,247,0.18)",
            borderRadius: 8,
            padding: "7px 12px",
            fontSize: "0.78rem",
            fontWeight: 600,
            fontFamily: "var(--font-body, sans-serif)",
            cursor: "pointer",
          }}
        >
          Log out
        </button>
      </div>
    </div>
  );
}
