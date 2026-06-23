"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { App } from "@/lib/contracts";
import { AvatarPicker } from "@/components/nav/AvatarPicker";

/**
 * Shared top navigation. Replaces the inline <nav> that was re-implemented across
 * ~15 pages. One configurable shell (sticky, var(--nav-bg), 64px row) with a
 * props-driven left cluster (back link / wordmark / admin badge / centered
 * wordmark) and right cluster (coin pill, Pro badge, first-name chip, links,
 * section label, account menu). `rightContent` is an escape hatch for bespoke
 * right sides (quiz counter, public CTAs, admin name).
 *
 * Note: this intentionally normalises a few previously-divergent details (one
 * coin-pill style, a single 18px wordmark size, a consistent 64px row) so every
 * page reads identically — that consolidation is the point of the refactor.
 */
export interface NavbarProps {
  /** Render a "← Back" link to this href on the left. */
  backHref?: string;
  /** Show the app wordmark (default true). */
  showWordmark?: boolean;
  /** Make the (non-centered) wordmark a link to this href (public/result pages). */
  wordmarkHref?: string;
  /** Absolutely-center the wordmark (help page). */
  centerWordmark?: boolean;
  /** Right-side section label, e.g. "Settings", "Quiz Results" (primary, bold). */
  sectionLabel?: string;
  /** Capycoin balance — renders the coin pill when provided. */
  coinBalance?: number;
  /** Show the "Pro ✦" badge. */
  isPro?: boolean;
  /** First-name chip (collapses on mobile). */
  userName?: string;
  /** Right-side nav links (Rewards, Help …). */
  links?: Array<{ label: string; href: string }>;
  /** Render the account/avatar menu. */
  showAvatarMenu?: boolean;
  /** "Admin" badge beside the wordmark. */
  adminBadge?: boolean;
  /** Bespoke right-cluster content — replaces the composed right side when set. */
  rightContent?: ReactNode;
}

const WORDMARK_STYLE: CSSProperties = {
  fontFamily: "var(--font-display, serif)",
  fontWeight: 700,
  fontSize: "calc(18px * var(--font-scale))",
  color: "var(--nav-text)",
};

export function Navbar({
  backHref,
  showWordmark = true,
  wordmarkHref,
  centerWordmark = false,
  sectionLabel,
  coinBalance,
  isPro,
  userName,
  links,
  showAvatarMenu,
  adminBadge,
  rightContent,
}: NavbarProps) {
  const composedRight = (
    <div className="nav-cluster" style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {coinBalance !== undefined && (
        <div
          title="Capycoins remaining"
          className="nav-coin-pill"
          style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--nav-bg)", border: "1px solid rgba(196,122,46,0.3)", borderRadius: 20, padding: "5px 14px" }}
        >
          <img src="/capy/capycoin.png" alt="" width={32} height={32} style={{ borderRadius: "50%" }} />
          <span style={{ fontSize: "calc(13px * var(--font-scale))", fontWeight: 600, color: "var(--primary-soft)" }}>
            {coinBalance}
            <span className="nav-collapse"> Capycoins</span>
          </span>
        </div>
      )}
      {isPro && (
        <span style={{ background: "var(--primary)", color: "var(--on-primary)", borderRadius: 999, padding: "4px 10px", fontSize: "calc(12.5px * var(--font-scale))", fontWeight: 600 }}>
          Pro ✦
        </span>
      )}
      {userName && (
        <span className="nav-collapse" style={{ fontSize: "calc(15px * var(--font-scale))", fontWeight: 600, color: "var(--nav-text)" }}>
          {userName}
        </span>
      )}
      {links?.map((l) => (
        <Link key={l.href} href={l.href} className="nav-link" style={{ color: "var(--text-faint)", textDecoration: "none", fontSize: "calc(14px * var(--font-scale))" }}>
          {l.label}
        </Link>
      ))}
      {sectionLabel && (
        <span style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--primary)", fontWeight: 700 }}>{sectionLabel}</span>
      )}
      {showAvatarMenu && <AvatarPicker />}
    </div>
  );

  return (
    <nav style={{ background: "var(--nav-bg)", borderBottom: "1px solid var(--nav-border)", position: "sticky", top: 0, zIndex: 50 }}>
      <div
        className="nav-row"
        style={{
          position: centerWordmark ? "relative" : undefined,
          maxWidth: "100%",
          margin: "0 auto",
          padding: "0 24px",
          minHeight: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {backHref && (
            <a href={backHref} className="nav-link" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
              <span style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--text-faint)" }}>← Back</span>
            </a>
          )}
          {backHref && showWordmark && !centerWordmark && (
            <span style={{ color: "var(--nav-border)", margin: "0 8px" }}>|</span>
          )}
          {showWordmark && !centerWordmark && (
            wordmarkHref ? (
              <a href={wordmarkHref} className="nav-link" style={{ textDecoration: "none" }}>
                <span className="nav-wordmark" style={WORDMARK_STYLE}>{App.name}</span>
              </a>
            ) : (
              <span className="nav-wordmark" style={WORDMARK_STYLE}>{App.name}</span>
            )
          )}
          {adminBadge && (
            <span style={{ fontSize: "calc(12px * var(--font-scale))", background: "var(--primary)", color: "var(--nav-text)", borderRadius: 20, padding: "2px 10px", fontWeight: 700, marginLeft: 4 }}>
              Admin
            </span>
          )}
        </div>

        {centerWordmark && showWordmark && (
          wordmarkHref ? (
            <a
              href={wordmarkHref}
              className="nav-link"
              style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", whiteSpace: "nowrap", textDecoration: "none" }}
            >
              <span style={WORDMARK_STYLE}>{App.name}</span>
            </a>
          ) : (
            <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", whiteSpace: "nowrap", ...WORDMARK_STYLE }}>
              {App.name}
            </span>
          )
        )}

        {rightContent !== undefined ? (
          <div className="nav-cluster" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {rightContent}
          </div>
        ) : (
          composedRight
        )}
      </div>
    </nav>
  );
}
