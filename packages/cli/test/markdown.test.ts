import { describe, expect, test } from "bun:test";

import { parseBlocks } from "../src/ui/parse-markdown";

describe("parseBlocks", () => {
  test("separates fenced code from prose", () => {
    const blocks = parseBlocks("antes\n```go\nfunc main() {}\n```\ndepois");

    expect(blocks.map((block) => block.kind)).toEqual([
      "prose",
      "code",
      "prose",
    ]);
    expect(blocks[1]?.language).toBe("go");
  });

  test("keeps code lines verbatim", () => {
    const blocks = parseBlocks("```\n  indented **not bold**\n```");
    expect(blocks[0]?.lines[0]?.[0]?.text).toBe("  indented **not bold**");
  });

  test("handles a fence with no language", () => {
    const blocks = parseBlocks("```\nx\n```");
    expect(blocks[0]?.language).toBeUndefined();
  });

  test("tints inline code", () => {
    const blocks = parseBlocks("use `close(ch)` there");
    const segments = blocks[0]?.lines[0] ?? [];

    expect(segments.some((segment) => segment.text === "close(ch)")).toBe(true);
    expect(
      segments.find((segment) => segment.text === "close(ch)")?.color,
    ).toBeDefined();
  });

  test("marks bold", () => {
    const blocks = parseBlocks("this is **important** here");
    const segments = blocks[0]?.lines[0] ?? [];

    expect(segments.find((segment) => segment.text === "important")?.bold).toBe(
      true,
    );
  });

  test("renders a bullet with its own glyph", () => {
    const blocks = parseBlocks("- first\n- second");

    expect(blocks[0]?.lines).toHaveLength(2);
    expect(blocks[0]?.lines[0]?.[0]?.text.trim()).toBe("·");
  });

  test("survives an unclosed fence mid-stream", () => {
    const blocks = parseBlocks("antes\n```go\nfunc main() {");

    expect(blocks).toHaveLength(2);
    expect(blocks[1]?.kind).toBe("code");
  });

  test("renders a partial first line while streaming", () => {
    const blocks = parseBlocks("o pro");

    expect(blocks[0]?.kind).toBe("prose");
    expect(blocks[0]?.lines[0]?.[0]?.text).toBe("o pro");
  });

  test("yields a single empty line for empty input", () => {
    const blocks = parseBlocks("");

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.kind).toBe("prose");
    expect(blocks[0]?.lines).toHaveLength(1);
  });
});
