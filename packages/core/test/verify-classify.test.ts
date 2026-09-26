import { describe, expect, test } from "bun:test";

import { classifyRun } from "../src/verify/classify";
import type { CommandResult } from "../src/verify/runner";

function result(overrides: Partial<CommandResult> = {}): CommandResult {
  return {
    exitCode: 0,
    stdout: "",
    stderr: "",
    timedOut: false,
    spawnError: null,
    durationMs: 100,
    ...overrides,
  };
}

describe("classifyRun", () => {
  test("a clean exit is evidence of a pass", () => {
    const report = classifyRun(result({ stdout: "ok\n" }), "go test ./...");

    expect(report.outcome).toBe("pass");
    expect(report.isEvidence).toBe(true);
  });

  test("a genuine test failure is evidence", () => {
    const report = classifyRun(
      result({
        exitCode: 1,
        stdout: "--- FAIL: TestAppend\n    want 3, got 2\n",
      }),
      "go test ./...",
    );

    expect(report.outcome).toBe("fail");
    expect(report.isEvidence).toBe(true);
  });

  test("a missing binary is an environment problem, not a failed attempt", () => {
    const report = classifyRun(
      result({ exitCode: 127, stderr: "bash: go: command not found\n" }),
      "go test ./...",
    );

    expect(report.outcome).toBe("environment");
    expect(report.isEvidence).toBe(false);
  });

  test("a spawn failure never becomes evidence", () => {
    const report = classifyRun(
      result({ exitCode: -1, spawnError: "ENOENT" }),
      "go test ./...",
    );

    expect(report.outcome).toBe("environment");
    expect(report.isEvidence).toBe(false);
  });

  test("an unresolved import is an environment problem", () => {
    const report = classifyRun(
      result({
        exitCode: 1,
        stderr: "ModuleNotFoundError: No module named 'httpx'\n",
      }),
      "pytest",
    );

    expect(report.outcome).toBe("environment");
    expect(report.isEvidence).toBe(false);
  });

  test("an empty suite is not a pass", () => {
    const report = classifyRun(
      result({ exitCode: 1, stdout: "no tests to run\n" }),
      "go test ./...",
    );

    expect(report.isEvidence).toBe(false);
  });

  test("a timeout is reported without becoming evidence", () => {
    const report = classifyRun(
      result({ exitCode: 143, timedOut: true }),
      "go test ./...",
    );

    expect(report.outcome).toBe("timeout");
    expect(report.isEvidence).toBe(false);
  });
});
