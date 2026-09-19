const SUPPORTS_COLOR =
  process.stdout.isTTY === true && process.env["NO_COLOR"] === undefined;

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  fox: "\x1b[38;2;175;169;236m",
} as const;

function paint(code: string, text: string): string {
  return SUPPORTS_COLOR ? `${code}${text}${ANSI.reset}` : text;
}

export const ui = {
  fox: (text: string) => paint(ANSI.fox, text),
  dim: (text: string) => paint(ANSI.dim, text),
  bold: (text: string) => paint(ANSI.bold, text),
  prompt: () => (SUPPORTS_COLOR ? `${ANSI.fox}❯${ANSI.reset} ` : "> "),
  step: (step: number) => paint(ANSI.fox, `[step ${step}/3]`),
};

export function banner(model: string, repoRoot: string): string {
  return [
    `${ui.fox("hibi")} ${ui.dim("日々")}`,
    ui.dim(`${model} · ${repoRoot}`),
    "",
  ].join("\n");
}
