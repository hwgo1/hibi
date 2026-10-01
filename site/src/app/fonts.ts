import localFont from "next/font/local";

export const sans = localFont({
  src: "../fonts/outfit.woff2",
  variable: "--font-sans",
  weight: "100 900",
  display: "swap",
});

export const mono = localFont({
  src: "../fonts/jetbrains-mono.woff2",
  variable: "--font-mono",
  weight: "100 800",
  display: "swap",
  adjustFontFallback: false,
});

// Subset to the two glyphs of 日々 (under 1 KB).
export const jp = localFont({
  src: "../fonts/noto-sans-jp-hibi.woff2",
  variable: "--font-jp",
  weight: "300",
  display: "block",
  adjustFontFallback: false,
});
