import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { indexRepo } from "../src/repo/indexer";

const NOW = new Date("2026-01-01T00:00:00.000Z");

async function withRepo<T>(
  build: (dir: string) => Promise<void>,
  fn: (dir: string) => Promise<T>,
): Promise<T> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "hibi-index-")));
  try {
    await build(dir);
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("indexRepo", () => {
  test("detects a Go project with its version and test command", async () => {
    const model = await withRepo(
      async (dir) => {
        await writeFile(
          join(dir, "go.mod"),
          "module example.com/app\n\ngo 1.22\n",
        );
        await writeFile(join(dir, "main.go"), "package main\n");
      },
      (dir) => indexRepo(dir, NOW),
    );

    const sub = model.subprojects[0]!;
    expect(sub.path).toBe(".");
    expect(sub.languages).toContain("Go");
    expect(sub.languageVersion).toBe("1.22");
    expect(sub.testCommand).toBe("go test ./...");
  });

  test("produces one subproject per manifest in a monorepo", async () => {
    const model = await withRepo(
      async (dir) => {
        await mkdir(join(dir, "api"), { recursive: true });
        await mkdir(join(dir, "web"), { recursive: true });
        await writeFile(join(dir, "api", "go.mod"), "module api\n\ngo 1.22\n");
        await writeFile(join(dir, "api", "main.go"), "package main\n");
        await writeFile(join(dir, "web", "package.json"), '{"name":"web"}');
        await writeFile(join(dir, "web", "index.ts"), "export {}\n");
      },
      (dir) => indexRepo(dir, NOW),
    );

    expect(model.subprojects).toHaveLength(2);
    expect(model.subprojects.map((sub) => sub.path).sort()).toEqual([
      "api",
      "web",
    ]);
  });

  test("falls back to one subproject inferred from extensions", async () => {
    const model = await withRepo(
      async (dir) => {
        await writeFile(join(dir, "script.py"), "print(1)\n");
      },
      (dir) => indexRepo(dir, NOW),
    );

    expect(model.subprojects).toHaveLength(1);
    expect(model.subprojects[0]!.path).toBe(".");
    expect(model.subprojects[0]!.languages).toContain("Python");
  });

  test("indexes a language with no manifest parser", async () => {
    const model = await withRepo(
      async (dir) => {
        await writeFile(
          join(dir, "Gemfile"),
          "source 'https://rubygems.org'\n",
        );
        await writeFile(join(dir, "app.rb"), "puts 1\n");
        await writeFile(join(dir, "lib.rb"), "module Lib; end\n");
      },
      (dir) => indexRepo(dir, NOW),
    );

    expect(model.fileStats.total).toBe(2);
    expect(model.subprojects[0]!.languages).toContain("Ruby");
  });

  test("skips dependency directories", async () => {
    const model = await withRepo(
      async (dir) => {
        await mkdir(join(dir, "node_modules", "left-pad"), { recursive: true });
        await writeFile(
          join(dir, "node_modules", "left-pad", "index.js"),
          "module.exports=1\n",
        );
        await writeFile(join(dir, "app.ts"), "export {}\n");
      },
      (dir) => indexRepo(dir, NOW),
    );

    expect(model.fileStats.total).toBe(1);
  });

  test("skips hidden directories", async () => {
    const model = await withRepo(
      async (dir) => {
        await mkdir(join(dir, ".github", "workflows"), { recursive: true });
        await writeFile(
          join(dir, ".github", "workflows", "ci.yml"),
          "name: ci\n",
        );
        await writeFile(join(dir, "app.ts"), "export {}\n");
      },
      (dir) => indexRepo(dir, NOW),
    );

    expect(model.fileStats.total).toBe(1);
  });

  test("marks machine-written files as generated", async () => {
    const model = await withRepo(
      async (dir) => {
        await writeFile(join(dir, "app.ts"), "export {}\n");
        await writeFile(join(dir, "app.min.js"), "1\n");
      },
      (dir) => indexRepo(dir, NOW),
    );

    expect(model.fileStats.total).toBe(2);
    expect(model.fileStats.generated).toBe(1);
  });

  test("skips a file larger than the size limit", async () => {
    const model = await withRepo(
      async (dir) => {
        await writeFile(join(dir, "small.ts"), "export {}\n");
        await writeFile(join(dir, "huge.ts"), "x".repeat(2 * 1024 * 1024));
      },
      (dir) => indexRepo(dir, NOW),
    );

    expect(model.fileStats.total).toBe(1);
  });

  test("reports no git and attributes nothing outside a repository", async () => {
    const model = await withRepo(
      async (dir) => {
        await writeFile(join(dir, "app.ts"), "export {}\n");
      },
      (dir) => indexRepo(dir, NOW),
    );

    expect(model.hasGit).toBe(false);
    expect(model.singleAuthor).toBe(false);
    expect(model.fileStats.unknown).toBe(1);
    expect(model.userAuthoredFiles).toHaveLength(0);
  });

  test("summarizes the tree by directory rather than by file", async () => {
    const model = await withRepo(
      async (dir) => {
        await mkdir(join(dir, "internal", "list"), { recursive: true });
        for (const name of ["a.go", "b.go", "c.go"]) {
          await writeFile(
            join(dir, "internal", "list", name),
            "package list\n",
          );
        }
      },
      (dir) => indexRepo(dir, NOW),
    );

    expect(model.treeSummary).toContain("internal/list/ (3)");
  });

  test("stays bounded on a repository with many files", async () => {
    const model = await withRepo(
      async (dir) => {
        await mkdir(join(dir, "src"), { recursive: true });
        for (let i = 0; i < 200; i++) {
          await writeFile(join(dir, "src", `mod${i}.ts`), "export {}\n");
        }
      },
      (dir) => indexRepo(dir, NOW),
    );

    expect(model.fileStats.total).toBe(200);
    expect(model.treeSummary.split("\n").length).toBeLessThanOrEqual(60);
    expect(model.userAuthoredFiles.length).toBeLessThanOrEqual(40);
  });
});
