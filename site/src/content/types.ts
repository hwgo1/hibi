export type Tone = "bold" | "dim" | "muted" | "accent" | "accentDim" | "brand" | "code" | "pulse";

export interface Span {
  text: string;
  tone?: Tone;
}

export type Inline = string;

export interface SessionExchange {
  input: string;
  reply: string;
  thinkMs: number;
  hint?: 1 | 2 | 3;
}

export interface SessionDemo {
  path: string;
  greeting: string;
  hint: string;
  thinking: string;
  hintLabel: string;
  exchanges: SessionExchange[];
}

export interface OnboardingDemo {
  intro: string;
  introDetail: string;
  language: { title: string; question: string };
  name: { title: string; question: string; answer: string };
  key: {
    title: string;
    explain: string;
    provider: string;
    choose: string;
    where: string;
    prompt: string;
    pasted: string;
    checking: string;
    ok: string;
    saved: string;
  };
  ready: string;
}

export type TerminalDemo =
  | { kind: "session"; data: SessionDemo }
  | { kind: "onboarding"; data: OnboardingDemo };

export interface DiagramLabels {
  cli: string;
  cliNote: string;
  editor: string;
  editorNote: string;
  socket: string;
  daemon: string;
  daemonNote: string;
  core: string;
  coreNote: string;
  disk: string;
  diskNote: string;
  model: string;
  modelNote: string;
}

export type Block =
  | { kind: "lead" | "p" | "note"; text: Inline }
  | { kind: "h3"; text: string }
  | { kind: "subs" | "stack"; items: { title: Inline; body: Inline }[] }
  | { kind: "chips"; items: { text: string; highlight?: boolean; arrow?: boolean }[] }
  | {
      kind: "table";
      title?: string;
      head?: string[];
      columns: string;
      minWidth?: string;
      mono: boolean[];
      rows: Inline[][];
    }
  | { kind: "weights"; head: string[]; rows: { source: string; weight: number; example: string }[] }
  | { kind: "bars"; rows: { label: string; percent: number; value: string }[] }
  | {
      kind: "cards";
      items: { label?: string; title?: string; file?: string; body: Inline; sample?: string }[];
    }
  | { kind: "steps"; items: { label: string; text: string }[] }
  | { kind: "callout"; title: Inline; body: Inline }
  | { kind: "code"; head: string; lines: string[]; copyable?: boolean }
  | { kind: "output"; command: string; lines: Span[][] }
  | { kind: "terminal"; demo: "onboarding" }
  | { kind: "tree"; items: { path: string; note: string }[] }
  | { kind: "ul"; items: Inline[] }
  | { kind: "ol"; items: { title: Inline; body: Inline }[] }
  | { kind: "diagram"; labels: DiagramLabels }
  | { kind: "notyet"; head: string; badge: string; items: { title: string; body: Inline }[] };

export type SectionGroup = "intro" | "docs" | "meta";

export interface Section {
  id: string;
  toc: string;
  group: SectionGroup;
  eyebrow: string;
  title: string;
  pre?: { eyebrow: string; title: string };
  blocks: Block[];
}

export interface Dictionary {
  locale: "en" | "pt";
  htmlLang: string;
  ogLocale: string;
  path: "/" | "/pt";
  meta: { title: string; description: string };
  nav: { install: string; docs: string; built: string; status: string };
  toc: { title: string; docs: string; top: string };
  copy: { copy: string; copied: string };
  term: { skip: string; replay: string };
  hero: {
    badge: string;
    tagline: string;
    lead: string;
    primary: string;
    secondary: string;
    github: string;
    foxAlt: string;
    demoLabel: string;
    pillars: { title: string; body: string }[];
  };
  footer: { repo: string; issues: string; note: string };
  demos: { session: SessionDemo; onboarding: OnboardingDemo };
  sections: Section[];
}
