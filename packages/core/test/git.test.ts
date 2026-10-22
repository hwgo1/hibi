import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readAuthorship } from "../src/repo/git";
import { indexRepo } from "../src/repo/indexer";

const ME = "me@example.com";

function git(cwd: string, ...args: string[]): void {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "ignore",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

function commitAs(cwd: string, email: string, message: string): void {
  git(cwd, "-c", `user.email=${email}`, "-c", "user.name=x", "commit", "-q", "-m", message);
}

const lines = (count: number) =>
  Array.from({ length: count }, (_, index) => `line ${index}`).join("\n") + "\n";

async function withGitRepo<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "hibi-git-")));
  try {
    git(dir, "init", "-q");
    git(dir, "config", "user.email", ME);
    git(dir, "config", "commit.gpgsign", "false");
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("readAuthorship", () => {
  test("a repository with no commits yet counts its untracked files as the user's", async () => {
    await withGitRepo(async (dir) => {
      await writeFile(join(dir, "main.go"), lines(12));
      await writeFile(join(dir, "notes.go"), lines(5));

      const report = await readAuthorship(dir, new Set(["main.go"]));

      expect(report.hasGit).toBe(true);
      expect([...report.linesByFile]).toEqual([["main.go", 12]]);
    });
  });

  test("adds staged and unstaged work to what the user committed, and nothing of others'", async () => {
    await withGitRepo(async (dir) => {
      await writeFile(join(dir, "mine.go"), lines(12));
      git(dir, "add", "mine.go");
      commitAs(dir, ME, "mine");

      await writeFile(join(dir, "theirs.go"), lines(20));
      git(dir, "add", "theirs.go");
      commitAs(dir, "other@example.com", "theirs");

      await writeFile(join(dir, "theirs.go"), lines(31));
      await writeFile(join(dir, "staged.go"), lines(10));
      git(dir, "add", "staged.go");

      const report = await readAuthorship(dir, new Set());

      expect(Object.fromEntries(report.linesByFile)).toEqual({
        "mine.go": 12,
        "theirs.go": 11,
        "staged.go": 10,
      });
    });
  });

  test("paths are relative to a root inside a larger repository", async () => {
    await withGitRepo(async (dir) => {
      const sub = join(dir, "svc");
      await mkdir(sub);
      await writeFile(join(sub, "api.go"), lines(10));
      git(dir, "add", ".");
      commitAs(dir, ME, "api");
      await writeFile(join(sub, "new.go"), lines(10));

      const report = await readAuthorship(sub, new Set(["new.go"]));

      expect(Object.fromEntries(report.linesByFile)).toEqual({
        "api.go": 10,
        "new.go": 10,
      });
    });
  });

  test("outside a repository nothing is attributed", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hibi-nogit-"));
    try {
      expect(await readAuthorship(dir, new Set())).toEqual({
        hasGit: false,
        linesByFile: new Map(),
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("indexRepo on a new project", () => {
  test("code written but never committed is the user's", async () => {
    await withGitRepo(async (dir) => {
      await writeFile(join(dir, "go.mod"), "module example.com/chat\n\ngo 1.24\n");
      await writeFile(join(dir, "main.go"), lines(14));

      const model = await indexRepo(dir, new Date("2026-01-01T00:00:00.000Z"));

      expect(model.subprojects[0]).toMatchObject({ languages: ["Go"], languageVersion: "1.24" });
      expect(model.userAuthoredFiles).toEqual(["main.go"]);
      expect(model.fileStats.user).toBe(1);
    });
  });
});
