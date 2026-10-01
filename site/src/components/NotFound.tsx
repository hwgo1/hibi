"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import terminal from "./terminal/terminal.module.css";
import styles from "./notfound.module.css";

const REDIRECT_SECONDS = 8;

const COPY = {
  en: {
    home: "/",
    unknown: "I don't know that page.",
    redirect: (s: number) => `Taking you to the start in ${s}s.`,
    cancelled: "Redirect cancelled.",
    start: "Go to the start",
    docs: "Open the docs",
    stay: "Stay here",
  },
  pt: {
    home: "/pt",
    unknown: "Não conheço essa página.",
    redirect: (s: number) => `Levando você para o início em ${s}s.`,
    cancelled: "Redirecionamento cancelado.",
    start: "Ir para o início",
    docs: "Abrir a documentação",
    stay: "Ficar aqui",
  },
} as const;

type Locale = keyof typeof COPY;

// Cloudflare Pages serves this one file for every missing path, so the
// language comes from the URL, then the browser.
function detectLocale(path: string): Locale {
  if (path === "/pt" || path.startsWith("/pt/")) return "pt";
  return navigator.language.toLowerCase().startsWith("pt") ? "pt" : "en";
}

export function NotFound() {
  const [locale, setLocale] = useState<Locale>("en");
  const [path, setPath] = useState("");
  const [seconds, setSeconds] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const current = window.location.pathname;
    const detected = detectLocale(current);
    document.documentElement.lang = detected === "pt" ? "pt-BR" : "en";
    setLocale(detected);
    setPath(current);
    setSeconds(REDIRECT_SECONDS);
    setReady(true);
  }, []);

  const copy = COPY[locale];

  useEffect(() => {
    if (seconds === null) return;
    if (seconds === 0) {
      window.location.replace(copy.home);
      return;
    }
    const timer = window.setTimeout(
      () => setSeconds((s) => (s === null ? s : s - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [seconds, copy.home]);

  const counting = seconds !== null;

  return (
    <main className={styles.page} data-ready={ready ? "" : undefined}>
      <div className={styles.inner}>
        <Image
          src="/assets/fox-confused.png"
          alt=""
          width={170}
          height={107}
          loading="eager"
          className={styles.fox}
        />
        <div className={terminal.terminal}>
          <div className={terminal.bar}>
            <span className={terminal.dots} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className={styles.code}>404</span>
          </div>
          <div className={terminal.body} data-ready="">
            <div className={terminal.line}>
              <span className={terminal.accentDim}>❯ </span>
              <span className={terminal.muted}>{path || "/"}</span>
            </div>
            <div className={terminal.line} />
            <h1 className={`${terminal.line} ${styles.message}`}>
              {copy.unknown}
            </h1>
            <p
              className={`${terminal.line} ${styles.status}`}
              aria-live="polite"
            >
              {counting ? copy.redirect(seconds) : ready ? copy.cancelled : ""}
            </p>
          </div>
        </div>
        <div className={styles.actions}>
          <a href={copy.home} className={styles.primary}>
            {copy.start}
          </a>
          <a href={`${copy.home}#commands`} className={styles.secondary}>
            {copy.docs}
          </a>
          {counting ? (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setSeconds(null)}
            >
              {copy.stay}
            </button>
          ) : null}
        </div>
      </div>
    </main>
  );
}
