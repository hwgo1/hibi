import Image from "next/image";
import type { Dictionary } from "@/content/types";
import { REPO_URL } from "@/lib/site";
import styles from "./landing.module.css";

const LANGUAGES = [
  { locale: "en", label: "EN", href: "/" },
  { locale: "pt", label: "PT", href: "/pt" },
] as const;

export function Header({ dict }: { dict: Dictionary }) {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <a href="#top" className={styles.brand}>
          <Image src="/assets/fox.png" alt="" width={24} height={21} />
          <span className={styles.brandName}>hibi</span>
          <span className={`jp ${styles.brandJp}`}>日々</span>
        </a>
        <nav className={styles.nav}>
          <a href="#install">{dict.nav.install}</a>
          <a href="#commands">{dict.nav.docs}</a>
          <a href="#built">{dict.nav.built}</a>
          <a href="#status">{dict.nav.status}</a>
        </nav>
        <div className={styles.headerEnd}>
          <div className={styles.langs} role="group" aria-label="Language">
            {LANGUAGES.map((lang) => (
              <a
                key={lang.locale}
                href={lang.href}
                hrefLang={lang.locale}
                aria-current={lang.locale === dict.locale ? "page" : undefined}
              >
                {lang.label}
              </a>
            ))}
          </div>
          <a href={REPO_URL} className={styles.github}>
            GitHub <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
      <div className={styles.progress} aria-hidden="true" />
    </header>
  );
}
