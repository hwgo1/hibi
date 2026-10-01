import type { ReactNode } from "react";
import styles from "./blocks.module.css";

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/g;

// Inline subset used by the content files: `code`, **bold**, [text](url).
export function Rich({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(text.slice(cursor, index));
    const token = match[0];

    if (match[1]) {
      parts.push(<code key={index} className={styles.inlineCode}>{token.slice(1, -1)}</code>);
    } else if (match[2]) {
      parts.push(<strong key={index} className={styles.strong}>{token.slice(2, -2)}</strong>);
    } else {
      const split = token.indexOf("](");
      const href = token.slice(split + 2, -1);
      const external = href.startsWith("http");
      parts.push(
        <a key={index} href={href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
          {token.slice(1, split)}
        </a>,
      );
    }
    cursor = index + token.length;
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}
