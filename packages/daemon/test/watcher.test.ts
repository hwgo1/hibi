import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { classifyChange, watchSpace, type SpaceWatcher } from "../src/watcher";

describe("classifyChange", () => {
  test.each([
    [".git/HEAD", "structure"],
    [".git/refs/heads/main", "structure"],
    [".git/packed-refs", "structure"],
    ["go.mod", "structure"],
    ["apps/web/package.json", "structure"],
    ["cmd/main.go", "edit"],
    ["README.md", "edit"],
    [".git/objects/ab/cdef", null],
    [".git/index", null],
    ["node_modules/x/package.json", null],
    [".venv/lib/site.py", null],
    ["src/.main.go.swp", null],
  ] as const)("%s is %p", (path, kind) => {
    expect(classifyChange(path)).toBe(kind);
  });
});

const TIMING = { structureMs: 40, editMs: 40, quietMs: 400, pollMs: 50 };

async function until(condition: () => boolean, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let root = "";
let watcher: SpaceWatcher | null = null;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "hibi-watch-")));
});

afterEach(async () => {
  watcher?.close();
  watcher = null;
  await rm(root, { recursive: true, force: true });
});

describe.each([
  ["native", false],
  ["polling", true],
])("watchSpace (%s)", (_, poll) => {
  function start() {
    const seen = { reindex: 0, edited: [] as string[] };
    watcher = watchSpace(
      root,
      {
        reindex: () => seen.reindex++,
        edited: (path) => seen.edited.push(path),
      },
      { poll, timing: TIMING },
    );
    return seen;
  }

  test("a manifest appearing reindexes without waiting for editing to pause", async () => {
    const seen = start();
    await pause(120);

    await writeFile(join(root, "go.mod"), "module x\n");
    await writeFile(join(root, "main.go"), "package main\n");
    await until(() => seen.reindex === 1, TIMING.quietMs - 100);
  });

  test("repeated saves of one file are one edit, and a quiet reindex follows", async () => {
    const seen = start();
    await pause(120);
    await mkdir(join(root, "cmd"));

    for (let index = 0; index < 3; index++) {
      await writeFile(join(root, "cmd", "main.go"), `package main // ${index}\n`);
    }
    await until(() => seen.edited.length > 0);
    await until(() => seen.reindex === 1);

    expect(seen.edited).toEqual(["cmd/main.go"]);
  });

  test("changes inside ignored directories are not seen", async () => {
    const seen = start();
    await pause(120);
    await mkdir(join(root, "node_modules", "x"), { recursive: true });
    await writeFile(join(root, "node_modules", "x", "index.js"), "1\n");

    await pause(TIMING.quietMs + 200);
    expect(seen).toEqual({ reindex: 0, edited: [] });
  });

  test("nothing fires after close", async () => {
    const seen = start();
    await pause(120);
    await writeFile(join(root, "main.go"), "package main\n");
    watcher!.close();

    await pause(TIMING.quietMs + 200);
    expect(seen).toEqual({ reindex: 0, edited: [] });
  });
});
