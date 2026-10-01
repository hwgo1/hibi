"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Span, TerminalDemo } from "@/content/types";
import { compile, fold, renderLines, type RenderLine } from "./engine";
import styles from "./terminal.module.css";

interface TerminalProps {
  demo: TerminalDemo;
  labels: { skip: string; replay: string };
  ariaLabel: string;
  height?: number;
}

type Phase = "waiting" | "playing" | "done";

const START_DELAY = 400;

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function Terminal({ demo, labels, ariaLabel, height }: TerminalProps) {
  const steps = useMemo(() => compile(demo), [demo]);
  const thinking = demo.kind === "session" ? demo.data.thinking : "";

  // Server render is the finished transcript, so the page reads correctly without JS
  const [pos, setPos] = useState(steps.length);
  const [phase, setPhase] = useState<Phase>("done");
  const [ready, setReady] = useState(false);

  const rootRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReady(true);
      return;
    }
    setPos(0);
    setPhase("waiting");
    setReady(true);

    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setPhase((current) => (current === "waiting" ? "playing" : current));
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [steps]);

  useEffect(() => {
    if (phase !== "playing") return;
    if (pos >= steps.length) {
      setPhase("done");
      return;
    }
    const delay = pos === 0 ? START_DELAY : (steps[pos - 1]?.delay ?? 0);
    const timer = window.setTimeout(
      () => setPos((current) => current + 1),
      delay,
    );
    return () => window.clearTimeout(timer);
  }, [phase, pos, steps]);

  const lines = useMemo(
    () => renderLines(fold(steps, pos), thinking),
    [steps, pos, thinking],
  );
  const finalLines = useMemo(
    () => (height ? [] : renderLines(fold(steps, steps.length), thinking)),
    [steps, thinking, height],
  );

  useIsomorphicLayoutEffect(() => {
    const body = bodyRef.current;
    if (height && body) body.scrollTop = body.scrollHeight;
  }, [lines, height]);

  const finished = phase === "done";

  return (
    <figure ref={rootRef} className={styles.terminal} aria-label={ariaLabel}>
      <div className={styles.bar}>
        <span className={styles.dots} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            if (finished) {
              setPos(0);
              setPhase("playing");
            } else {
              setPos(steps.length);
              setPhase("done");
            }
          }}
        >
          {finished ? labels.replay : labels.skip}
        </button>
      </div>
      <div
        ref={bodyRef}
        className={styles.body}
        data-ready={ready ? "" : undefined}
        style={height ? { height } : undefined}
      >
        {lines.map((line, i) => (
          <TerminalLine key={i} line={line} />
        ))}
        {finalLines.slice(lines.length).map((line, i) => (
          <TerminalLine key={`r${i}`} line={line} reserved />
        ))}
      </div>
    </figure>
  );
}

function TerminalLine({
  line,
  reserved = false,
}: {
  line: RenderLine;
  reserved?: boolean;
}) {
  return (
    <div
      className={styles.line}
      style={line.indent ? { paddingLeft: `${line.indent}ch` } : undefined}
      aria-hidden={reserved || undefined}
      data-reserved={reserved ? "" : undefined}
    >
      {line.spans.map((span, i) => (
        <SpanText key={i} span={span} />
      ))}
      {line.caret ? (
        <span
          className={line.caret === "blink" ? styles.caretBlink : styles.caret}
        />
      ) : null}
    </div>
  );
}

function SpanText({ span }: { span: Span }) {
  return span.tone ? (
    <span className={styles[span.tone]}>{span.text}</span>
  ) : (
    <>{span.text}</>
  );
}
