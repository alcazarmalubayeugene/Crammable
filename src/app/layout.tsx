import type { Metadata } from "next";
import Script from "next/script";
import {
  Lora,
  DM_Sans,
  Playfair_Display,
  Fraunces,
  Nunito,
  EB_Garamond,
  Plus_Jakarta_Sans,
  Libre_Baskerville,
} from "next/font/google";
import { App, Routes } from "@/lib/contracts";
import PaymentNotifications from "./PaymentNotifications";
import {
  ThemeProvider,
  THEME_STORAGE_KEY,
  FONT_SIZE_STORAGE_KEY,
  FONT_SCALES,
  FONT_PAIR_STORAGE_KEY,
  FONT_PAIRS,
} from "@/lib/theme/ThemeProvider";
import "./globals.css";

// Runs before paint so a returning user never sees a flash of the wrong
// theme/font, AND so a first-time visitor (nothing in localStorage yet)
// lands directly on the real defaults — dark + Baskerville, per the co-dev
// request that's what most users actually prefer — instead of flashing the
// old light/Lora CSS defaults for one frame before ThemeProvider mounts.
// Reads from the same localStorage keys ThemeProvider uses. Public/pre-login
// pages always stay light — see PUBLIC_ROUTES in ThemeProvider.tsx for why.
const PUBLIC_ROUTES_FOR_SCRIPT = [Routes.home, Routes.login, Routes.signup, Routes.forgotPassword];
const ANTI_FLASH_SCRIPT = `
(function() {
  try {
    var isPublicRoute = ${JSON.stringify(PUBLIC_ROUTES_FOR_SCRIPT)}.indexOf(location.pathname) !== -1;
    var theme = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}) || "dark";
    if (theme === "dark" && !isPublicRoute) document.documentElement.setAttribute("data-theme", "dark");
    var fontSize = localStorage.getItem(${JSON.stringify(FONT_SIZE_STORAGE_KEY)});
    var scales = ${JSON.stringify(FONT_SCALES)};
    if (fontSize && scales[fontSize]) {
      document.documentElement.style.setProperty("--font-scale", String(scales[fontSize]));
    }
    var fontPair = localStorage.getItem(${JSON.stringify(FONT_PAIR_STORAGE_KEY)}) || "baskerville";
    var pairs = ${JSON.stringify(FONT_PAIRS)};
    if (pairs[fontPair]) {
      document.documentElement.style.setProperty("--font-display", pairs[fontPair].display);
      document.documentElement.style.setProperty("--font-body", pairs[fontPair].body);
    }
  } catch (e) {}
})();
`;

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

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  weight: ["400", "500", "600", "700"],
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["400", "500", "600", "700"],
});

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["400", "500", "600", "700"],
});

const garamond = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-garamond",
  weight: ["400", "500", "600", "700"],
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700"],
});

const baskerville = Libre_Baskerville({
  subsets: ["latin"],
  variable: "--font-baskerville",
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Crammable",
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
      <head>
        {/* next/script + beforeInteractive (not a raw <script> tag) — injected
            into the initial server-rendered HTML and runs before hydration,
            same timing a raw tag gave us, without React's dev-mode warning
            about script tags rendered as JSX. */}
        <Script id="anti-flash-script" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: ANTI_FLASH_SCRIPT }} />
      </head>
      <body
        className={`${lora.variable} ${dmSans.variable} ${playfair.variable} ${fraunces.variable} ${nunito.variable} ${garamond.variable} ${jakarta.variable} ${baskerville.variable} antialiased`}
        style={{ fontFamily: "var(--font-body, var(--font-dm-sans)), sans-serif" }}
      >
        <ThemeProvider>
          {children}
          <PaymentNotifications />
          <div
            style={{
              position: "fixed",
              bottom: 12,
              right: 14,
              zIndex: 40,
              fontSize: "calc(11px * var(--font-scale))",
              fontWeight: 600,
              color: "var(--nav-text-muted)",
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
        </ThemeProvider>
      </body>
    </html>
  );
}