import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findRepoRoot } from "../src/repo-root";

describe("findRepoRoot", () => {
  test("resolves a subdirectory to the repository root", async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), "hibi-root-")));
    try {
      await mkdir(join(dir, ".git"), { recursive: true });
      await mkdir(join(dir, "internal", "list"), { recursive: true });

      expect(await findRepoRoot(join(dir, "internal", "list"))).toBe(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("falls back to the starting directory without a repository", async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), "hibi-noroot-")));
    try {
      await writeFile(join(dir, "file.txt"), "x");
      expect(await findRepoRoot(dir)).toBe(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
