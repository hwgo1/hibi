import { describe, expect, test } from "bun:test";

import type { FileContent, Workspace } from "../src/ports/workspace";
import { buildToolRegistry, type ToolContext } from "../src/tools";
import { renderPage } from "../src/tools/workspace-tools";
import { testContext } from "./fixtures";

const workspace: Workspace = {
  root: "/tmp/repo",
  async listFiles() {
    return { entries: [], truncated: false };
  },
  async readFile(path) {
    return { path, text: "x", contentHash: "h", dirty: false };
  },
  async activeDocument() {
    return null;
  },
};

function context(): ToolContext {
  return { ...testContext(), workspace };
}

describe("read_file", () => {
  test("keeps only the most recent files pinned", async () => {
    const ctx = context();
    const registry = buildToolRegistry();

    for (const path of ["a.go", "b.go", "c.go", "d.go"]) {
      await registry.execute("read_file", { path }, ctx);
    }

    expect(ctx.session.contextFiles).toEqual(["b.go", "c.go", "d.go"]);
  });

  test("re-reading a file moves it to the end instead of duplicating it", async () => {
    const ctx = context();
    const registry = buildToolRegistry();

    await registry.execute("read_file", { path: "a.go" }, ctx);
    await registry.execute("read_file", { path: "b.go" }, ctx);
    await registry.execute("read_file", { path: "a.go" }, ctx);

    expect(ctx.session.contextFiles).toEqual(["b.go", "a.go"]);
  });

  test("refuses a lockfile without reading or pinning it", async () => {
    const ctx = context();
    const outcome = await buildToolRegistry().execute(
      "read_file",
      { path: "web/package-lock.json" },
      ctx,
    );

    expect(outcome.isError).toBe(true);
    expect(ctx.session.contextFiles).toEqual([]);
  });
});

describe("renderPage", () => {
  const file = (text: string): FileContent => ({
    path: "big.go",
    text,
    contentHash: "h",
    dirty: false,
  });
  const lines = Array.from({ length: 3000 }, (_, i) => `line ${i + 1}`);

  test("cuts at a line boundary and says where to continue", () => {
    const page = renderPage(file(lines.join("\n")), 1);
    const resume = Number(page.match(/startLine (\d+)/)?.[1]);

    expect(page.length).toBeLessThan(12_200);
    expect(page).toContain("line 1\n");
    expect(page).toContain(`line ${resume - 1}\n[continues`);
    expect(page).not.toContain(`line ${resume}\n`);
  });

  test("the last page has no continuation", () => {
    const page = renderPage(file(lines.join("\n")), 2990);

    expect(page).toContain("lines 2990-3000 of 3000");
    expect(page).not.toContain("[continues");
  });

  test("a line longer than a page is cut and marked", () => {
    const page = renderPage(file("x".repeat(20_000)), 1);

    expect(page).toContain("[line cut]");
    expect(page.length).toBeLessThan(12_200);
  });

  test("a start past the end says so", () => {
    expect(renderPage(file("a\nb"), 9)).toBe(
      "big.go has 2 lines; nothing at line 9.",
    );
  });
});
