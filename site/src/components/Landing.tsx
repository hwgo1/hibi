import type { Dictionary, SectionGroup } from "@/content/types";
import { Blocks } from "./Blocks";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { Hero } from "./Hero";
import { ScrollEffects } from "./ScrollEffects";
import { Toc } from "./Toc";
import styles from "./landing.module.css";

export function Landing({ dict }: { dict: Dictionary }) {
  const tocItems = (group: SectionGroup) =>
    dict.sections.filter((s) => s.group === group).map((s) => ({ id: s.id, label: s.toc }));

  return (
    <>
      <Header dict={dict} />
      <Toc intro={tocItems("intro")} docs={tocItems("docs")} meta={tocItems("meta")} labels={dict.toc} />
      <main>
        <Hero dict={dict} />
        {dict.sections.map((section, index) => (
          <section key={section.id} id={section.id} className={styles.section} data-alt={index % 2 ? "" : undefined}>
            <div className={styles.sectionInner}>
              <div className={styles.column} data-reveal>
                {section.pre ? (
                  <>
                    <div className={styles.eyebrow}>{section.pre.eyebrow}</div>
                    <h2 className={styles.preTitle}>{section.pre.title}</h2>
                  </>
                ) : null}
                <div className={styles.eyebrow}>{section.eyebrow}</div>
                {section.group === "docs" ? (
                  <h3 className={styles.docTitle}>{section.title}</h3>
                ) : (
                  <h2 className={styles.title}>{section.title}</h2>
                )}
                <Blocks blocks={section.blocks} dict={dict} />
              </div>
            </div>
          </section>
        ))}
      </main>
      <Footer dict={dict} />
      <ScrollEffects />
    </>
  );
}
