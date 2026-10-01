import Image from "next/image";
import type { Dictionary } from "@/content/types";
import { REPO_URL } from "@/lib/site";
import styles from "./landing.module.css";

export function Footer({ dict }: { dict: Dictionary }) {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerRow}>
          <div className={styles.footerBrand}>
            <Image src="/assets/fox.png" alt="" width={26} height={23} />
            <span className={styles.brandName}>hibi</span>
            <span className={`jp ${styles.brandJp}`}>日々</span>
          </div>
          <div className={styles.footerLinks}>
            <a href={REPO_URL}>{dict.footer.repo}</a>
            <a href={`${REPO_URL}/issues`}>{dict.footer.issues}</a>
          </div>
        </div>
        <p className={styles.footerNote}>{dict.footer.note}</p>
      </div>
    </footer>
  );
}
