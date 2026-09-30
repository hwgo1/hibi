import { glyphs, theme } from "./theme";

export interface Segment {
  text: string;
  color?: string;
  bold?: boolean;
  dim?: boolean;
}

export interface Block {
  kind: "prose" | "code";
  language?: string;
  lines: Segment[][];
}

const FENCE = /^\s*```(\S*)\s*$/;
const HEADING = /^#{1,6}\s+(.*)$/;
const BULLET = /^(\s*)[-*]\s+(.*)$/;
const INLINE = /(`[^`]+`|\*\*[^*]+\*\*)/g;

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let current: Block = { kind: "prose", lines: [] };

  for (const line of text.split("\n")) {
    const fence = FENCE.exec(line);

    if (fence !== null) {
      if (current.lines.length > 0) blocks.push(current);
      const language =
        fence[1] !== undefined && fence[1].length > 0 ? fence[1] : undefined;
      current =
        current.kind === "code"
          ? { kind: "prose", lines: [] }
          : { kind: "code", language, lines: [] };
      continue;
    }

    current.lines.push(
      current.kind === "code" ? [{ text: line }] : parseInline(line),
    );
  }

  if (current.lines.length > 0) blocks.push(current);
  return blocks;
}

function parseInline(line: string): Segment[] {
  const heading = HEADING.exec(line);
  if (heading !== null) return [{ text: heading[1] ?? "", bold: true }];

  const bullet = BULLET.exec(line);
  const segments: Segment[] =
    bullet !== null
      ? [{ text: `${bullet[1] ?? ""}${glyphs.bullet} `, color: theme.muted }]
      : [];
  const body = bullet !== null ? (bullet[2] ?? "") : line;

  let cursor = 0;

  for (const match of body.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > cursor) segments.push({ text: body.slice(cursor, index) });

    const token = match[0];
    if (token.startsWith("`")) {
      segments.push({ text: token.slice(1, -1), color: theme.accent });
    } else {
      segments.push({ text: token.slice(2, -2), bold: true });
    }
    cursor = index + token.length;
  }

  if (cursor < body.length) segments.push({ text: body.slice(cursor) });
  return segments.length > 0 ? segments : [{ text: "" }];
}
