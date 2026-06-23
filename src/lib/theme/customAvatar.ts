"use client";

import { useEffect, useState } from "react";

export const CUSTOM_AVATAR_STORAGE_KEY = "crammable-custom-avatar";
export const DEFAULT_AVATAR_SRC = "/capy/avatar-default.png";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const AVATAR_OUTPUT_SIZE = 256;

// localStorage-only — no backend storage/schema exists for a custom avatar
// yet, same precedent as the theme/font preference in ThemeProvider.
export function useCustomAvatar(): [string, (dataUrl: string) => void, () => void] {
  const [avatarSrc, setAvatarSrcState] = useState<string>(DEFAULT_AVATAR_SRC);

  useEffect(() => {
    const stored = localStorage.getItem(CUSTOM_AVATAR_STORAGE_KEY);
    if (stored) setAvatarSrcState(stored);
  }, []);

  function setAvatarSrc(dataUrl: string) {
    setAvatarSrcState(dataUrl);
    localStorage.setItem(CUSTOM_AVATAR_STORAGE_KEY, dataUrl);
  }

  function resetAvatar() {
    setAvatarSrcState(DEFAULT_AVATAR_SRC);
    localStorage.removeItem(CUSTOM_AVATAR_STORAGE_KEY);
  }

  return [avatarSrc, setAvatarSrc, resetAvatar];
}

// Crops to a centered square and downscales before handing back a data URL,
// so any source photo renders cleanly in the circular avatar slot and stays
// small enough for localStorage regardless of the original file's dimensions.
export function readImageAsSquareDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      reject(new Error("Please choose a PNG or JPG image."));
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      reject(new Error("Image is too large — please choose one under 5 MB."));
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;

      const canvas = document.createElement("canvas");
      canvas.width = AVATAR_OUTPUT_SIZE;
      canvas.height = AVATAR_OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");
      URL.revokeObjectURL(objectUrl);

      if (!ctx) {
        reject(new Error("Could not process that image."));
        return;
      }
      ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read that image."));
    };
    img.src = objectUrl;
  });
}
