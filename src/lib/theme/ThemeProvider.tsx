"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Routes } from "@/lib/contracts";

// Dark mode is a localStorage device preference with nowhere to "log out" of —
// without this, one person enabling it in Settings leaks it onto the public
// marketing/auth pages for the next, possibly-unrelated visitor on that
// browser. These are exactly the routes contracts.ts tags "// Public".
const PUBLIC_ROUTES: ReadonlySet<string> = new Set([
  Routes.home,
  Routes.login,
  Routes.signup,
  Routes.forgotPassword,
]);

export type ThemeMode = "light" | "dark";
export type FontSizeKey = "small" | "default" | "large" | "xlarge";

export const FONT_SCALES: Record<FontSizeKey, number> = {
  small: 0.9,
  default: 1,
  large: 1.15,
  xlarge: 1.3,
};

export const FONT_SIZE_LABELS: Record<FontSizeKey, string> = {
  small: "Small",
  default: "Default",
  large: "Large",
  xlarge: "Extra large",
};

export type FontPairKey = "lora" | "playfair" | "fraunces" | "garamond" | "baskerville";

export const FONT_PAIRS: Record<FontPairKey, { label: string; display: string; body: string }> = {
  lora: { label: "Lora · DM Sans", display: "var(--font-lora)", body: "var(--font-dm-sans)" },
  playfair: { label: "Playfair · DM Sans", display: "var(--font-playfair)", body: "var(--font-dm-sans)" },
  fraunces: { label: "Fraunces · Nunito", display: "var(--font-fraunces)", body: "var(--font-nunito)" },
  garamond: { label: "EB Garamond · Jakarta", display: "var(--font-garamond)", body: "var(--font-jakarta)" },
  baskerville: { label: "Baskerville · Nunito", display: "var(--font-baskerville)", body: "var(--font-nunito)" },
};

export const THEME_STORAGE_KEY = "crammable-theme";
export const FONT_SIZE_STORAGE_KEY = "crammable-font-size";
export const FONT_PAIR_STORAGE_KEY = "crammable-font-pair";

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  fontSize: FontSizeKey;
  setFontSize: (fontSize: FontSizeKey) => void;
  fontPair: FontPairKey;
  setFontPair: (fontPair: FontPairKey) => void;
  // Apply to the live DOM only — no persistence, no context-state change.
  // Lets Settings show a preview before the user hits "Save preferences".
  previewTheme: (theme: ThemeMode) => void;
  previewFontSize: (fontSize: FontSizeKey) => void;
  previewFontPair: (fontPair: FontPairKey) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// FONT_PAIRS stores tokens like "var(--font-playfair)". Chaining that inside
// another custom property (--font-display: var(--font-playfair)) and then
// consuming it as font-family: var(--font-display) is a double indirection
// that doesn't reliably repaint live in this app's setup — so resolve the
// inner var() to its actual computed font stack and set --font-display to
// that literal value instead (single indirection, always repaints).
function resolveFontVar(token: string): string {
  const match = /^var\((--[a-z0-9-]+)\)$/i.exec(token.trim());
  if (!match || typeof document === "undefined" || !document.body) return token;
  const resolved = getComputedStyle(document.body).getPropertyValue(match[1]).trim();
  return resolved || token;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublicRoute = PUBLIC_ROUTES.has(pathname);
  const [theme, setThemeState] = useState<ThemeMode>("dark");
  const [fontSize, setFontSizeState] = useState<FontSizeKey>("default");
  const [fontPair, setFontPairState] = useState<FontPairKey>("baskerville");

  // Pick up whatever the anti-flash inline script (in layout.tsx) already
  // applied to <html>, so React state matches the DOM on first render.
  useEffect(() => {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    const storedFontSize = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    const storedFontPair = localStorage.getItem(FONT_PAIR_STORAGE_KEY);
    if (storedTheme === "light" || storedTheme === "dark") setThemeState(storedTheme);
    if (storedFontSize && storedFontSize in FONT_SCALES) setFontSizeState(storedFontSize as FontSizeKey);
    if (storedFontPair && storedFontPair in FONT_PAIRS) setFontPairState(storedFontPair as FontPairKey);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", isPublicRoute ? "light" : theme);
  }, [theme, isPublicRoute]);

  useEffect(() => {
    document.documentElement.style.setProperty("--font-scale", String(FONT_SCALES[fontSize]));
  }, [fontSize]);

  useEffect(() => {
    const pair = FONT_PAIRS[fontPair];
    document.documentElement.style.setProperty("--font-display", resolveFontVar(pair.display));
    document.documentElement.style.setProperty("--font-body", resolveFontVar(pair.body));
  }, [fontPair]);

  function setTheme(next: ThemeMode) {
    setThemeState(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
  }

  function setFontSize(next: FontSizeKey) {
    setFontSizeState(next);
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, next);
  }

  function setFontPair(next: FontPairKey) {
    setFontPairState(next);
    localStorage.setItem(FONT_PAIR_STORAGE_KEY, next);
  }

  function previewTheme(next: ThemeMode) {
    document.documentElement.setAttribute("data-theme", next);
  }

  function previewFontSize(next: FontSizeKey) {
    document.documentElement.style.setProperty("--font-scale", String(FONT_SCALES[next]));
  }

  function previewFontPair(next: FontPairKey) {
    const pair = FONT_PAIRS[next];
    document.documentElement.style.setProperty("--font-display", resolveFontVar(pair.display));
    document.documentElement.style.setProperty("--font-body", resolveFontVar(pair.body));
  }

  return (
    <ThemeContext.Provider
      value={{
        theme, setTheme,
        fontSize, setFontSize,
        fontPair, setFontPair,
        previewTheme, previewFontSize, previewFontPair,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
