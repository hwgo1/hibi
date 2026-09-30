export const theme = {
  accent: "#AFA9EC",
  accentDim: "#7F77DD",
  muted: "gray",
  error: "red",
} as const;

/** Whether the terminal can render the glyphs below */
export function supportsUnicode(): boolean {
  if (process.env["TERM"] === "dumb") return false;
  const locale =
    process.env["LC_ALL"] ??
    process.env["LC_CTYPE"] ??
    process.env["LANG"] ??
    "";
  return /UTF-?8/i.test(locale) || process.platform === "darwin";
}

const UNICODE = {
  prompt: "❯",
  status: "⬢",
  error: "✕",
  gutter: "│",
  bullet: "·",
} as const;

const ASCII = {
  prompt: ">",
  status: "*",
  error: "x",
  gutter: "|",
  bullet: "-",
} as const;

export const glyphs = supportsUnicode() ? UNICODE : ASCII;
