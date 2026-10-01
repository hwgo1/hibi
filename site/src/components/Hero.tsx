import Image from "next/image";
import type { Dictionary } from "@/content/types";
import { REPO_URL } from "@/lib/site";
import { Terminal } from "./terminal/Terminal";
import styles from "./hero.module.css";

const stagger = (i: number) => ({ animationDelay: `${80 + i * 70}ms` });

export function Hero({ dict }: { dict: Dictionary }) {
  const { hero } = dict;

  return (
    <section id="top" className={styles.hero}>
      <div className={styles.inner}>
        <div className={styles.grid}>
          <div className={styles.copy}>
            <a data-hero style={stagger(0)} href="#status" className={styles.badge}>
              <span>0.1</span>
              {hero.badge}
            </a>
            <div data-hero style={stagger(1)} className={styles.heading}>
              <h1 className={styles.wordmark}>
                <span>hibi</span>
                <span className="jp">日々</span>
              </h1>
              <p className={styles.tagline}>{hero.tagline}</p>
            </div>
            <p data-hero style={stagger(2)} className={styles.lead}>
              {hero.lead}
            </p>
            <div data-hero style={stagger(3)} className={styles.actions}>
              <a href="#install" className={styles.primary}>
                {hero.primary}
              </a>
              <a href="#hints" className={styles.secondary}>
                {hero.secondary}
              </a>
              <a href={REPO_URL} className={styles.secondary}>
                {hero.github}
              </a>
            </div>
          </div>
          <div data-hero style={stagger(4)} className={styles.demo}>
            <Image
              src="/assets/fox-lying.png"
              alt={hero.foxAlt}
              width={150}
              height={91}
              loading="eager"
              fetchPriority="high"
              className={styles.fox}
            />
            <Terminal
              demo={{ kind: "session", data: dict.demos.session }}
              labels={dict.term}
              ariaLabel={hero.demoLabel}
              height={470}
            />
          </div>
        </div>
        <div data-hero style={stagger(5)} className={styles.pillars}>
          {hero.pillars.map((pillar) => (
            <div key={pillar.title} className={styles.pillar}>
              <h2>{pillar.title}</h2>
              <p>{pillar.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
