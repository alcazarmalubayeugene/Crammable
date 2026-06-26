import type { CSSProperties } from "react";

/**
 * Base shimmer block. Use it to reserve the space a piece of not-yet-loaded
 * content will occupy so the surrounding shell (nav, background) stays put
 * instead of blanking behind a full-screen spinner. The shimmer animation and
 * theme-var colours live in globals.css (`.skeleton` / `@keyframes shimmer`).
 */
export function Skeleton({
  width = "100%",
  height = 16,
  radius = 8,
  style,
}: {
  width?: number | string;
  height?: number | string;
  /** border-radius in px (use a large number for pills). */
  radius?: number;
  style?: CSSProperties;
}) {
  return <div className="skeleton" style={{ width, height, borderRadius: radius, ...style }} />;
}

/**
 * Skeleton standing in for a dashboard deck card while decks load — mirrors the
 * real card's frame (var(--bg-card), 1.5px border, 16px radius, 20px/22px
 * padding) with placeholder lines for the title, meta row, and "Quiz me" pill.
 */
export function SkeletonDeckCard() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background: "var(--bg-card)",
        border: "1.5px solid var(--border)",
        borderRadius: 16,
        padding: "20px 22px",
      }}
    >
      <Skeleton height={18} width="70%" />
      <Skeleton height={12} width="45%" />
      <Skeleton height={30} width={96} radius={8} style={{ marginTop: 4 }} />
    </div>
  );
}
