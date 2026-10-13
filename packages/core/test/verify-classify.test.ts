import { describe, expect, test } from "bun:test";

import { classifyRun } from "../src/verify/classify";
import type { CommandResult } from "../src/verify/runner";
import type { RunSummary } from "../src/verify/test-runners";

const COMMAND = "go test -json -count=1 -run ^(TestReverse)$ .";

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

function run(passed: number, failed: number, output = ""): RunSummary {
  return { passed, failed, output };
}

describe("classifyRun", () => {
  test("tests that pass are evidence of a pass", () => {
    const report = classifyRun(result(), run(2, 0), [], COMMAND);

    expect(report).toMatchObject({
      outcome: "pass",
      isEvidence: true,
      isAttempt: true,
    });
  });

  test("a failing test is evidence of a fail", () => {
    const report = classifyRun(result({ exitCode: 1 }), run(1, 1), [], COMMAND);

    expect(report).toMatchObject({ outcome: "fail", isEvidence: true });
  });

  test("zero tests is never a pass, even on a clean exit", () => {
    const report = classifyRun(result(), run(0, 0), [], COMMAND);

    expect(report).toMatchObject({
      outcome: "no-tests",
      isEvidence: false,
      isAttempt: false,
    });
  });

  test("the runner's own no-match message is not a result", () => {
    const output = 'error: regex "nope" matched 0 tests';
    const report = classifyRun(
      result({ exitCode: 1 }),
      run(0, 0, output),
      [/matched 0 tests/],
      COMMAND,
    );

    expect(report.outcome).toBe("no-tests");
  });

  test("code that fails before any test runs is an attempt, not evidence", () => {
    const report = classifyRun(
      result({ exitCode: 1 }),
      run(0, 0, "./rev.go:3:1: syntax error: unexpected }"),
      [],
      COMMAND,
    );

    expect(report).toMatchObject({
      outcome: "broken",
      isEvidence: false,
      isAttempt: true,
    });
  });

  test("passing tests with a failing exit code are not a pass", () => {
    const report = classifyRun(result({ exitCode: 1 }), run(2, 0), [], COMMAND);

    expect(report).toMatchObject({ outcome: "broken", isEvidence: false });
  });

  test("a missing binary is an environment problem, not an attempt", () => {
    const report = classifyRun(
      result({ exitCode: 127 }),
      run(0, 0, "bash: go: command not found\n"),
      [],
      COMMAND,
    );

    expect(report).toMatchObject({
      outcome: "environment",
      isEvidence: false,
      isAttempt: false,
    });
  });

  test("setup noise does not hide tests that ran", () => {
    const report = classifyRun(
      result({ exitCode: 1 }),
      run(
        0,
        1,
        "go: downloading github.com/x/y v1.0.0\n--- FAIL: TestReverse\n",
      ),
      [],
      COMMAND,
    );

    expect(report.outcome).toBe("fail");
  });

  test("a spawn failure never becomes evidence", () => {
    const report = classifyRun(
      result({ exitCode: -1, spawnError: "ENOENT" }),
      run(0, 0),
      [],
      COMMAND,
    );

    expect(report).toMatchObject({ outcome: "environment", isEvidence: false });
  });

  test("a timeout counts as an attempt but not as evidence", () => {
    const report = classifyRun(
      result({ exitCode: 143, timedOut: true }),
      run(0, 0),
      [],
      COMMAND,
    );

    expect(report).toMatchObject({
      outcome: "timeout",
      isEvidence: false,
      isAttempt: true,
    });
  });
});
