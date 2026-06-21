"use client";

import { AVATAR_MOODS, useAvatarMood, type AvatarMoodKey } from "@/lib/theme/avatarMood";

// Nav-bar avatar circle with a hover-reveal mood picker. localStorage-only —
// see useAvatarMood. Reuses the default avatar art for every mood via CSS
// filters since no separate per-mood art exists yet.
const AVATAR_SRC = "/capy/avatar-default.png";

export function AvatarPicker() {
  const [mood, setMood] = useAvatarMood();

  return (
    <div className="avatar-wrap">
      <img
        className="avatar-pic"
        src={AVATAR_SRC}
        alt="Your Capy avatar"
        width={32}
        height={32}
        style={{ filter: AVATAR_MOODS[mood].filter }}
      />
      <div className="avatar-tooltip">
        <div style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,252,247,0.35)", marginBottom: 4 }}>
          CHOOSE YOUR CAPY
        </div>
        <div className="avatar-grid">
          {(Object.keys(AVATAR_MOODS) as AvatarMoodKey[]).map((key) => (
            <img
              key={key}
              src={AVATAR_SRC}
              alt={AVATAR_MOODS[key].label}
              title={AVATAR_MOODS[key].label}
              className={mood === key ? "selected" : ""}
              style={{ filter: AVATAR_MOODS[key].filter }}
              onClick={() => setMood(key)}
            />
          ))}
        </div>
        <div style={{ fontSize: "0.78rem", color: "rgba(255,252,247,0.6)", marginTop: 6, fontWeight: 600 }}>
          {AVATAR_MOODS[mood].label} Capy ✦
        </div>
      </div>
    </div>
  );
}
