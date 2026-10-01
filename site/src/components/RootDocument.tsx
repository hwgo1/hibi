import type { ReactNode } from "react";
import { jp, mono, sans } from "@/app/fonts";
import "@/app/globals.css";

// Flags JS before first paint so reveal and terminal styles never flash the
// server-rendered final state.
const JS_FLAG = "document.documentElement.classList.add('js')";

export function RootDocument({ lang, children }: { lang: string; children: ReactNode }) {
  return (
    <html lang={lang} className={`${sans.variable} ${mono.variable} ${jp.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: JS_FLAG }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
