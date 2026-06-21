"use client";

import { useEffect, useState } from "react";

export type AvatarMoodKey = "happy" | "sleepy" | "gradcap" | "beanie" | "headphones";

export const AVATAR_MOODS: Record<AvatarMoodKey, { label: string; filter: string }> = {
  happy:      { label: "Happy",      filter: "" },
  sleepy:     { label: "Sleepy",     filter: "sepia(0.4) brightness(0.8) saturate(1.3)" },
  gradcap:    { label: "Grad Cap",   filter: "hue-rotate(22deg) brightness(0.88)" },
  beanie:     { label: "Beanie",     filter: "hue-rotate(-20deg) saturate(1.6) brightness(0.92)" },
  headphones: { label: "Headphones", filter: "brightness(0.7) contrast(1.18) saturate(0.85)" },
};

export const AVATAR_MOOD_STORAGE_KEY = "crammable-avatar-mood";

// localStorage-only, same precedent as the theme/font preference in
// ThemeProvider — no profile/schema persistence. Defaults to "happy" on the
// server and first render, then hydrates from localStorage after mount.
export function useAvatarMood(): [AvatarMoodKey, (mood: AvatarMoodKey) => void] {
  const [mood, setMoodState] = useState<AvatarMoodKey>("happy");

  useEffect(() => {
    const stored = localStorage.getItem(AVATAR_MOOD_STORAGE_KEY);
    if (stored && stored in AVATAR_MOODS) setMoodState(stored as AvatarMoodKey);
  }, []);

  function setMood(next: AvatarMoodKey) {
    setMoodState(next);
    localStorage.setItem(AVATAR_MOOD_STORAGE_KEY, next);
  }

  return [mood, setMood];
}
