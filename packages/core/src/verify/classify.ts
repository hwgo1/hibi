import type { CommandResult } from "./runner";
import type { RunSummary } from "./test-runners";

export type VerifyOutcome =
  | "pass"
  | "fail"
  | "broken"
  | "no-tests"
  | "environment"
  | "timeout";

export interface VerifyReport {
  outcome: VerifyOutcome;
  /** Tests ran and decided the result */
  isEvidence: boolean;
  /** The learner's code ran; counts toward the hint ladder */
  isAttempt: boolean;
  summary: string;
}

/** Matched only when no test ran */
const ENVIRONMENT_PATTERNS: RegExp[] = [
  /command not found/i,
  /: not found$/im,
  /no such file or directory/i,
  /is not recognized as an internal or external command/i,
  /permission denied/i,
  /cannot find module ['"]?(?!\.)/i,
  /modulenotfounderror/i,
  /go: (?:cannot find|go\.mod file not found|downloading)/i,
  /could not resolve dependenc/i,
  /unable to access|could not resolve host|network is unreachable/i,
  /error: linker .* not found/i,
  /failed to load config/i,
  /could not determine executable to run/i,
  /canceled due to missing packages/i,
];

/** Zero tests is never a pass. Code that fails before any test runs is an attempt, not a result */
export function classifyRun(
  result: CommandResult,
  run: RunSummary,
  noTests: readonly RegExp[],
  command: string,
): VerifyReport {
  if (result.spawnError !== null) {
    return report(
      "environment",
      `could not run \`${command}\`: ${result.spawnError}`,
    );
  }
  if (result.timedOut) {
    return report("timeout", `\`${command}\` did not finish in time`);
  }

  const counts = `${run.passed} passed, ${run.failed} failed`;

  if (run.passed + run.failed > 0) {
    if (run.failed > 0) return report("fail", `\`${command}\`: ${counts}`);
    if (result.exitCode === 0) {
      return report(
        "pass",
        `\`${command}\`: ${counts} in ${formatDuration(result.durationMs)}`,
      );
    }
    return report(
      "broken",
      `\`${command}\`: ${counts}, but it exited with code ${result.exitCode}; something outside the tests failed`,
    );
  }

  if (
    result.exitCode === 0 ||
    noTests.some((pattern) => pattern.test(run.output))
  ) {
    return report(
      "no-tests",
      `\`${command}\` ran no tests: the test does not exist yet, or the names do not match`,
    );
  }

  if (ENVIRONMENT_PATTERNS.some((pattern) => pattern.test(run.output))) {
    return report(
      "environment",
      `\`${command}\` failed to run; this looks like a setup problem, not the user's code`,
    );
  }

  return report(
    "broken",
    `\`${command}\` failed before any test ran (exit code ${result.exitCode}); the code likely does not compile`,
  );
}

function report(outcome: VerifyOutcome, summary: string): VerifyReport {
  return {
    outcome,
    isEvidence: outcome === "pass" || outcome === "fail",
    isAttempt: outcome !== "no-tests" && outcome !== "environment",
    summary,
  };
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}
