import type {
  OnboardingDemo,
  SessionDemo,
  Span,
  TerminalDemo,
} from "@/content/types";
import { markdownLines } from "./markdown";

export interface Line {
  indent: number;
  spans: Span[];
}

export type Caret = "steady" | "blink" | null;

export interface Screen {
  lines: Line[];
  live: string | null;
  footer: "prompt" | "thinking" | null;
  input: string;
  caret: Caret;
}

type Op =
  | { t: "line"; line: Line }
  | { t: "append"; spans: Span[] }
  | { t: "replace"; line: Line }
  | { t: "caret"; caret: Caret }
  | { t: "footer"; footer: Screen["footer"] }
  | { t: "input"; text: string }
  | { t: "submit" }
  | { t: "token"; text: string }
  | { t: "commit"; lines: Line[] }
  | { t: "wait" };

export interface Step {
  op: Op;
  delay: number;
}

const BLANK: Line = { indent: 0, spans: [] };
const TUTOR_INDENT = 2;
const ONBOARDING_INDENT = 6;
const TOKEN = /\S+\s*|\s+/g;

export const EMPTY_SCREEN: Screen = {
  lines: [],
  live: null,
  footer: null,
  input: "",
  caret: null,
};

// Deterministic so server and client compile identical step lists
function jitter(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const typing = (seed: number) => 40 + jitter(seed) * 60;
const streaming = (seed: number) => 26 + jitter(seed + 0.5) * 28;

export function compile(demo: TerminalDemo): Step[] {
  return demo.kind === "session" ? session(demo.data) : onboarding(demo.data);
}

function session(d: SessionDemo): Step[] {
  const steps: Step[] = [];
  const add = (op: Op, delay = 0) => steps.push({ op, delay });

  add({
    t: "line",
    line: {
      indent: 0,
      spans: [
        { text: "hibi", tone: "brand" },
        { text: ` 日々 ${d.path}`, tone: "muted" },
      ],
    },
  });
  add({ t: "line", line: BLANK });
  add({ t: "line", line: { indent: 0, spans: [{ text: d.greeting }] } });
  add(
    {
      t: "line",
      line: { indent: 0, spans: [{ text: d.hint, tone: "muted" }] },
    },
    900,
  );
  add({ t: "footer", footer: "prompt" }, 600);

  d.exchanges.forEach((exchange, i) => {
    [...exchange.input].forEach((ch, j) =>
      add({ t: "input", text: ch }, typing(i * 100 + j)),
    );
    add({ t: "wait" }, 350);
    add({ t: "submit" }, exchange.thinkMs);

    const tokens = exchange.reply.match(TOKEN) ?? [];
    tokens.forEach((token, j) =>
      add({ t: "token", text: token }, streaming(i * 1000 + j)),
    );

    const label = exchange.hint
      ? [
          {
            indent: TUTOR_INDENT,
            spans: [
              {
                text: d.hintLabel.replace("{step}", String(exchange.hint)),
                tone: "accentDim" as const,
              },
            ],
          },
        ]
      : [];
    add(
      {
        t: "commit",
        lines: [
          BLANK,
          ...label,
          ...markdownLines(exchange.reply, TUTOR_INDENT),
        ],
      },
      1300,
    );
  });

  return steps;
}

function onboarding(d: OnboardingDemo): Step[] {
  const steps: Step[] = [];
  const add = (op: Op, delay = 0) => steps.push({ op, delay });
  const say = (text: string, indent = ONBOARDING_INDENT, tone?: Span["tone"]) =>
    text
      .split("\n")
      .forEach((line) =>
        add({ t: "line", line: { indent, spans: [{ text: line, tone }] } }, 60),
      );
  const heading = (counter: string, title: string) => {
    add({ t: "line", line: BLANK });
    add(
      {
        t: "line",
        line: {
          indent: 2,
          spans: [
            { text: counter.padEnd(3), tone: "accent" },
            { text: " " },
            { text: title, tone: "bold" },
          ],
        },
      },
      200,
    );
  };
  const ask = (question: string, answer: string, pause: number) => {
    add({
      t: "line",
      line: { indent: ONBOARDING_INDENT, spans: [{ text: `${question} ` }] },
    });
    add({ t: "caret", caret: "blink" }, pause);
    [...answer].forEach((ch, j) =>
      add({ t: "append", spans: [{ text: ch }] }, typing(j + answer.length)),
    );
    add({ t: "caret", caret: null }, 300);
  };

  add(
    {
      t: "line",
      line: {
        indent: 0,
        spans: [{ text: "$ ", tone: "muted" }, { text: "hibi" }],
      },
    },
    500,
  );
  add({ t: "line", line: BLANK });
  add({
    t: "line",
    line: {
      indent: 2,
      spans: [
        { text: "hibi", tone: "brand" },
        { text: " " },
        { text: "日々", tone: "dim" },
      ],
    },
  });
  add({ t: "line", line: BLANK });
  say(d.intro, 2);
  say(d.introDetail, 2, "dim");
  add({ t: "wait" }, 500);

  heading("1/3", d.language.title);
  ask(d.language.question, "", 1100);

  heading("2/3", d.name.title);
  ask(d.name.question, d.name.answer, 600);

  heading("3/3", d.key.title);
  say(d.key.explain, ONBOARDING_INDENT, "dim");
  add({ t: "wait" }, 600);
  add({ t: "line", line: BLANK });
  say(d.key.provider);
  add({
    t: "line",
    line: {
      indent: 8,
      spans: [{ text: "1", tone: "accent" }, { text: "  OpenAI" }],
    },
  });
  add({
    t: "line",
    line: {
      indent: 8,
      spans: [{ text: "2", tone: "accent" }, { text: "  Anthropic" }],
    },
  });
  ask(d.key.choose, "1", 500);

  add({ t: "line", line: BLANK });
  say(d.key.where, ONBOARDING_INDENT, "dim");
  add({
    t: "line",
    line: { indent: ONBOARDING_INDENT, spans: [{ text: `${d.key.prompt} ` }] },
  });
  add({ t: "caret", caret: "blink" }, 900);
  add({ t: "append", spans: [{ text: d.key.pasted }] }, 450);
  add({
    t: "replace",
    line: {
      indent: ONBOARDING_INDENT,
      spans: [
        { text: `${d.key.prompt} ${"•".repeat(8)}${d.key.pasted.slice(-4)}` },
      ],
    },
  });
  add({ t: "caret", caret: null });
  add(
    {
      t: "line",
      line: {
        indent: ONBOARDING_INDENT,
        spans: [{ text: d.key.checking, tone: "dim" }, { text: " " }],
      },
    },
    1100,
  );
  add({ t: "append", spans: [{ text: d.key.ok }] }, 200);
  say(d.key.saved, ONBOARDING_INDENT, "dim");

  add({ t: "line", line: BLANK });
  add({ t: "line", line: { indent: 2, spans: [{ text: d.ready }] } });

  return steps;
}

function apply(screen: Screen, op: Op): Screen {
  switch (op.t) {
    case "line":
      return { ...screen, lines: [...screen.lines, op.line] };
    case "append": {
      const last = screen.lines.at(-1);
      if (!last) return screen;
      return {
        ...screen,
        lines: [
          ...screen.lines.slice(0, -1),
          { ...last, spans: [...last.spans, ...op.spans] },
        ],
      };
    }
    case "replace":
      return { ...screen, lines: [...screen.lines.slice(0, -1), op.line] };
    case "caret":
      return { ...screen, caret: op.caret };
    case "footer":
      return {
        ...screen,
        footer: op.footer,
        caret: op.footer === "prompt" ? "steady" : null,
      };
    case "input":
      return { ...screen, input: screen.input + op.text };
    case "submit":
      return {
        ...screen,
        lines: [
          ...screen.lines,
          BLANK,
          {
            indent: 0,
            spans: [
              { text: "❯ ", tone: "accentDim" },
              { text: screen.input, tone: "muted" },
            ],
          },
        ],
        input: "",
        footer: "thinking",
        caret: null,
      };
    case "token":
      return { ...screen, live: (screen.live ?? "") + op.text };
    case "commit":
      return {
        ...screen,
        lines: [...screen.lines, ...op.lines],
        live: null,
        footer: "prompt",
        caret: "steady",
      };
    case "wait":
      return screen;
  }
}

export function fold(steps: Step[], count: number): Screen {
  let screen = EMPTY_SCREEN;
  for (let i = 0; i < count; i++) {
    const step = steps[i];
    if (step) screen = apply(screen, step.op);
  }
  return screen;
}

export interface RenderLine extends Line {
  caret?: Exclude<Caret, null>;
}

export function renderLines(screen: Screen, thinking: string): RenderLine[] {
  const lines: RenderLine[] = [...screen.lines];

  if (screen.live !== null)
    lines.push(BLANK, ...markdownLines(screen.live, TUTOR_INDENT));

  if (screen.footer === "prompt") {
    lines.push(BLANK, {
      indent: 0,
      spans: [{ text: "❯ ", tone: "accent" }, { text: screen.input }],
      caret: "steady",
    });
  } else if (screen.footer === "thinking") {
    lines.push(BLANK, {
      indent: 0,
      spans: [
        { text: "⬢", tone: "pulse" },
        { text: ` ${thinking}…`, tone: "muted" },
      ],
    });
  } else if (screen.caret === "blink" && lines.length > 0) {
    const last = lines[lines.length - 1]!;
    lines[lines.length - 1] = { ...last, caret: "blink" };
  }

  return lines;
}
