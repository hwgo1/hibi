import { describe, expect, test } from "bun:test";

import type { Workspace } from "../src/ports/workspace";
import { buildToolRegistry, type ToolContext } from "../src/tools";
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
});
