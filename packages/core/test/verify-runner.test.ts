import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseCommand, runCommand, truncateOutput } from "../src/verify/runner";

async function inTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "hibi-run-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("runCommand", () => {
  test("captures output and exit code", async () => {
    const result = await inTempDir((cwd) =>
      runCommand(["echo", "hello"], { cwd }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello");
    expect(result.spawnError).toBeNull();
  });

  test("reports a nonzero exit without throwing", async () => {
    const result = await inTempDir((cwd) => runCommand(["false"], { cwd }));
    expect(result.exitCode).not.toBe(0);
  });

  test("reports a missing binary instead of throwing", async () => {
    const result = await inTempDir((cwd) =>
      runCommand(["hibi-does-not-exist-xyz"], { cwd }),
    );

    expect(result.exitCode).toBe(-1);
    expect(result.spawnError).not.toBeNull();
  });

  test("kills a command that exceeds its timeout", async () => {
    const result = await inTempDir((cwd) =>
      runCommand(["sleep", "5"], { cwd, timeoutMs: 200 }),
    );

    expect(result.timedOut).toBe(true);
  });
});

describe("truncateOutput", () => {
  test("leaves short output untouched", () => {
    expect(truncateOutput("one\ntwo")).toBe("one\ntwo");
  });

  test("keeps the head and tail of long output", () => {
    const text = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n");
    const truncated = truncateOutput(text);

    expect(truncated).toContain("line 0");
    expect(truncated).toContain("line 199");
    expect(truncated).toContain("lines omitted");
    expect(truncated.split("\n").length).toBeLessThan(100);
  });
});

describe("parseCommand", () => {
  test("splits a manifest command into arguments", () => {
    expect(parseCommand("go test ./...")).toEqual(["go", "test", "./..."]);
  });

  test("collapses extra whitespace", () => {
    expect(parseCommand("  npm   test  ")).toEqual(["npm", "test"]);
  });
});
