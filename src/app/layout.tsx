import type { Metadata } from "next";
import { Lora, DM_Sans } from "next/font/google";
import { App } from "@/lib/contracts";
import "./globals.css";

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-lora",
  weight: ["400", "500", "600", "700"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Crammable — Turn any document into a flashcard deck",
  description:
    "Upload your PDF reviewer and AI instantly generates flashcards and quizzes — even from scanned, photocopied handouts. Built for Filipino university students.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${lora.variable} ${dmSans.variable} antialiased`}
        style={{ fontFamily: "var(--font-dm-sans), sans-serif" }}
      >
        {children}
        <div
          style={{
            position: "fixed",
            bottom: 12,
            left: 14,
            zIndex: 40,
            fontSize: 11,
            fontWeight: 600,
            color: "#C49A6C",
            background: "rgba(46,26,12,0.75)",
            backdropFilter: "blur(4px)",
            padding: "3px 9px",
            borderRadius: 6,
            letterSpacing: "0.04em",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          {App.version}
        </div>
      </body>
    </html>
  );
}