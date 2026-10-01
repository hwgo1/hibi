import type { Span } from "@/content/types";
import type { Line } from "./engine";

const FENCE = /^\s*```(\S*)\s*$/;
const HEADING = /^#{1,6}\s+(.*)$/;
const BULLET = /^(\s*)[-*]\s+(.*)$/;
const INLINE = /(`[^`]+`|\*\*[^*]+\*\*)/g;

export function markdownLines(text: string, indent: number): Line[] {
  const out: Line[] = [];
  let code: { language?: string } | null = null;

  for (const raw of text.split("\n")) {
    const fence = FENCE.exec(raw);
    if (fence) {
      if (code) {
        out.push({ indent, spans: [] });
        code = null;
      } else {
        out.push({ indent, spans: [] });
        if (fence[1])
          out.push({ indent, spans: [{ text: fence[1], tone: "muted" }] });
        code = {};
      }
      continue;
    }

    if (code) {
      out.push({
        indent,
        spans: [{ text: "│ ", tone: "muted" }, { text: raw || " " }],
      });
      continue;
    }

    out.push({ indent, spans: inline(raw) });
  }

  return out;
}

function inline(line: string): Span[] {
  const heading = HEADING.exec(line);
  if (heading) return [{ text: heading[1] ?? "", tone: "bold" }];

  const bullet = BULLET.exec(line);
  const spans: Span[] = bullet
    ? [{ text: `${bullet[1] ?? ""}· `, tone: "muted" }]
    : [];
  const body = bullet ? (bullet[2] ?? "") : line;

  let cursor = 0;
  for (const match of body.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > cursor) spans.push({ text: body.slice(cursor, index) });
    const token = match[0];
    spans.push(
      token.startsWith("`")
        ? { text: token.slice(1, -1), tone: "code" }
        : { text: token.slice(2, -2), tone: "bold" },
    );
    cursor = index + token.length;
  }
  if (cursor < body.length) spans.push({ text: body.slice(cursor) });

  return spans;
}
