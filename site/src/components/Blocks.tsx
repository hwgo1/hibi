import type { CSSProperties } from "react";
import type { Block, DiagramLabels, Dictionary, Span } from "@/content/types";
import { CopyButton } from "./CopyButton";
import { Rich } from "./Rich";
import { Terminal } from "./terminal/Terminal";
import styles from "./blocks.module.css";

const TREE_COLUMN = 22;

export function Blocks({ blocks, dict }: { blocks: Block[]; dict: Dictionary }) {
  return (
    <>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} dict={dict} />
      ))}
    </>
  );
}

function BlockView({ block, dict }: { block: Block; dict: Dictionary }) {
  switch (block.kind) {
    case "lead":
    case "p":
    case "note":
      return (
        <p className={styles[block.kind]}>
          <Rich text={block.text} />
        </p>
      );

    case "h3":
      return <h4 className={styles.h3}>{block.text}</h4>;

    case "subs":
    case "stack":
      return (
        <div className={styles[block.kind]}>
          {block.items.map((item) => (
            <div key={item.title} className={styles.item}>
              <div className={styles.itemTitle}>
                <Rich text={item.title} />
              </div>
              <p className={styles.itemBody}>
                <Rich text={item.body} />
              </p>
            </div>
          ))}
        </div>
      );

    case "chips":
      return (
        <div className={styles.chips}>
          {block.items.map((chip) =>
            chip.arrow ? (
              <span key={chip.text} className={styles.chipArrow} aria-hidden="true">
                {chip.text}
              </span>
            ) : (
              <span key={chip.text} className={styles.chip} data-highlight={chip.highlight ? "" : undefined}>
                {chip.text}
              </span>
            ),
          )}
        </div>
      );

    case "table": {
      const grid: CSSProperties = { gridTemplateColumns: block.columns };
      return (
        <div className={styles.tableWrap}>
          {block.title ? <div className={styles.tableTitle}>{block.title}</div> : null}
          <div className={styles.panel}>
            <div style={{ minWidth: block.minWidth ?? 0 }} role="table">
              {block.head ? (
                <div className={styles.tableHead} style={grid} role="row">
                  {block.head.map((cell) => (
                    <span key={cell} role="columnheader">
                      {cell}
                    </span>
                  ))}
                </div>
              ) : null}
              {block.rows.map((row) => (
                <div key={row[0]} className={styles.tableRow} style={grid} role="row">
                  {row.map((cell, j) => (
                    <div key={j} role="cell" className={styles.cell}>
                      {block.mono[j] ? (
                        <code className={styles.monoCell}>{cell}</code>
                      ) : (
                        <span className={styles.textCell}>
                          <Rich text={cell} />
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    case "weights":
      return (
        <div className={styles.panel}>
          <div className={styles.weights} role="table">
            <div className={`${styles.tableHead} ${styles.weightsGrid}`} role="row">
              {block.head.map((cell) => (
                <span key={cell} role="columnheader">
                  {cell}
                </span>
              ))}
            </div>
            {block.rows.map((row) => (
              <div key={row.source} className={`${styles.tableRow} ${styles.weightsGrid}`} role="row">
                <span role="cell" className={styles.weightSource}>
                  {row.source}
                </span>
                <span role="cell" className={styles.weightValue}>
                  <span className={styles.track}>
                    <span style={{ width: `${row.weight * 100}%` }} />
                  </span>
                  <code>{row.weight === 1 ? "1.0" : String(row.weight)}</code>
                </span>
                <span role="cell" className={styles.textCell}>
                  {row.example}
                </span>
              </div>
            ))}
          </div>
        </div>
      );

    case "bars":
      return (
        <div className={styles.bars}>
          {block.rows.map((row) => (
            <div key={row.label} className={styles.barRow}>
              <span>{row.label}</span>
              <span className={styles.barTrack}>
                <span style={{ width: `${row.percent}%` }} />
              </span>
              <code>{row.value}</code>
            </div>
          ))}
        </div>
      );

    case "cards":
      return (
        <div className={styles.cards}>
          {block.items.map((card) => (
            <div key={card.title ?? card.label} className={styles.card}>
              {card.label ? <span className={styles.cardLabel}>{card.label}</span> : null}
              {card.title ? (
                <div className={styles.cardHead}>
                  <span>{card.title}</span>
                  {card.file ? <code>{card.file}</code> : null}
                </div>
              ) : null}
              <p>
                <Rich text={card.body} />
              </p>
              {card.sample ? <div className={styles.sample}>{card.sample}</div> : null}
            </div>
          ))}
        </div>
      );

    case "steps":
      return (
        <ol className={styles.steps}>
          {block.items.map((step, i) => (
            <li key={step.label} className={styles.step}>
              <span className={styles.stepMeter} aria-hidden="true">
                {[0, 1, 2].map((j) => (
                  <span key={j} data-on={j <= i ? "" : undefined} />
                ))}
              </span>
              <span className={styles.stepLabel}>{step.label}</span>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      );

    case "callout":
      return (
        <div className={styles.callout}>
          <div className={styles.calloutTitle}>
            <Rich text={block.title} />
          </div>
          <p>
            <Rich text={block.body} />
          </p>
        </div>
      );

    case "code":
      return (
        <div className={styles.codeBlock}>
          <div className={styles.codeHead}>
            <span>{block.head}</span>
            {block.copyable ? <CopyButton text={block.lines.join("\n")} labels={dict.copy} /> : null}
          </div>
          <pre className={styles.codeBody}>{block.lines.join("\n")}</pre>
        </div>
      );

    case "output":
      return (
        <div className={styles.output}>
          <div className={styles.codeHead}>
            <span>
              <span className={styles.prompt}>❯</span> {block.command}
            </span>
          </div>
          <pre className={styles.codeBody}>
            {block.lines.map((line, i) => (
              <div key={i}>
                {line.map((span, j) => (
                  <OutputSpan key={j} span={span} />
                ))}
              </div>
            ))}
          </pre>
        </div>
      );

    case "terminal":
      return (
        <Terminal
          demo={{ kind: "onboarding", data: dict.demos.onboarding }}
          labels={dict.term}
          ariaLabel={dict.demos.onboarding.intro}
        />
      );

    case "tree":
      return (
        <pre className={styles.tree}>
          {block.items.map((item) => (
            <div key={item.path}>
              <span>{item.note ? item.path.padEnd(TREE_COLUMN) : item.path}</span>
              <span className={styles.treeNote}>{item.note}</span>
            </div>
          ))}
        </pre>
      );

    case "ul":
      return (
        <ul className={styles.ul}>
          {block.items.map((item) => (
            <li key={item}>
              <Rich text={item} />
            </li>
          ))}
        </ul>
      );

    case "ol":
      return (
        <ol className={styles.ol}>
          {block.items.map((item, i) => (
            <li key={item.title}>
              <span className={styles.olNumber}>{i + 1}</span>
              <div>
                <div className={styles.itemTitle}>
                  <Rich text={item.title} />
                </div>
                <p className={styles.itemBody}>
                  <Rich text={item.body} />
                </p>
              </div>
            </li>
          ))}
        </ol>
      );

    case "diagram":
      return <Diagram labels={block.labels} />;

    case "notyet":
      return (
        <div className={styles.notyet}>
          <div className={styles.notyetHead}>
            <span>{block.head}</span>
            <span className={styles.badge}>{block.badge}</span>
          </div>
          {block.items.map((item) => (
            <div key={item.title} className={styles.notyetRow}>
              <span className={styles.notyetTitle}>{item.title}</span>
              <span className={styles.notyetBody}>
                <Rich text={item.body} />
              </span>
            </div>
          ))}
        </div>
      );
  }
}

function OutputSpan({ span }: { span: Span }) {
  if (span.tone === "bold") return <strong className={styles.outBold}>{span.text}</strong>;
  if (span.tone === "dim") return <span className={styles.outDim}>{span.text}</span>;
  return <>{span.text}</>;
}

function Diagram({ labels }: { labels: DiagramLabels }) {
  return (
    <div className={styles.diagramWrap}>
      <div className={styles.diagram}>
        <div className={`${styles.node} ${styles.cli}`}>
          <code>{labels.cli}</code>
          <span>{labels.cliNote}</span>
        </div>
        <div className={`${styles.wire} ${styles.wireCli}`}>
          <span>{labels.socket}</span>
        </div>
        <div className={`${styles.node} ${styles.editor}`}>
          <code>{labels.editor}</code>
          <span>{labels.editorNote}</span>
        </div>
        <div className={`${styles.wire} ${styles.wireEditor}`} data-dashed="">
          <span>{labels.socket}</span>
        </div>
        <div className={styles.daemon}>
          <div className={styles.daemonHead}>
            <strong>{labels.daemon}</strong>
            <code>{labels.daemonNote}</code>
          </div>
          <div className={`${styles.node} ${styles.core}`}>
            <code>{labels.core}</code>
            <span>{labels.coreNote}</span>
          </div>
        </div>
        <div className={styles.drops} aria-hidden="true">
          <span />
          <span />
        </div>
        <div className={styles.stores}>
          <div className={styles.node}>
            <code>{labels.disk}</code>
            <span>{labels.diskNote}</span>
          </div>
          <div className={styles.node}>
            <code>{labels.model}</code>
            <span>{labels.modelNote}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
