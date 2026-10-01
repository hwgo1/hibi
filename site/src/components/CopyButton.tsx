"use client";

import { useEffect, useState } from "react";
import styles from "./blocks.module.css";

const RESET_MS = 1400;

export function CopyButton({ text, labels }: { text: string; labels: { copy: string; copied: string } }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), RESET_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      className={styles.copy}
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => setCopied(true), () => undefined);
      }}
    >
      <span aria-live="polite">{copied ? labels.copied : labels.copy}</span>
    </button>
  );
}
