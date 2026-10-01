"use client";

import { useEffect, useState } from "react";
import styles from "./landing.module.css";

interface TocItem {
  id: string;
  label: string;
}

interface TocProps {
  intro: TocItem[];
  docs: TocItem[];
  meta: TocItem[];
  labels: { title: string; docs: string; top: string };
}

// A 1%-tall band at 30% of the viewport decides the active section.
const BAND = "-30% 0px -69% 0px";

export function Toc({ intro, docs, meta, labels }: TocProps) {
  const [active, setActive] = useState("top");

  useEffect(() => {
    const ids = ["top", ...[...intro, ...docs, ...meta].map((item) => item.id)];
    const targets = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((entry) => entry.isIntersecting);
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: BAND },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [intro, docs, meta]);

  const link = (item: TocItem, compact = false) => (
    <a
      key={item.id}
      href={`#${item.id}`}
      className={compact ? styles.tocLinkCompact : styles.tocLink}
      aria-current={active === item.id ? "location" : undefined}
    >
      {item.label}
    </a>
  );

  return (
    <aside className={styles.toc} data-visible={active !== "top" ? "" : undefined} aria-label={labels.title}>
      <div className={styles.tocTitle}>{labels.title}</div>
      <nav className={styles.tocList}>
        {intro.map((item) => link(item))}
        <div className={styles.tocGroup}>{labels.docs}</div>
        {docs.map((item) => link(item, true))}
        <div className={styles.tocGap} />
        {meta.map((item) => link(item))}
      </nav>
      <a href="#top" className={styles.tocTop}>
        {labels.top}
      </a>
    </aside>
  );
}
