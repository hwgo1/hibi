import type { CommandResult } from "./runner";

export type VerifyOutcome = "pass" | "fail" | "environment" | "timeout";

export interface VerifyReport {
  outcome: VerifyOutcome;
  isEvidence: boolean;
  summary: string;
  output: string;
}

/** Patterns in a failure that point at the environment rather than the code */
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
  /no tests? (?:found|to run)/i,
  /error: linker .* not found/i,
  /failed to load config/i,
];

export function classifyRun(
  result: CommandResult,
  command: string,
): VerifyReport {
  const output = `${result.stdout}\n${result.stderr}`;

  if (result.spawnError !== null) {
    return {
      outcome: "environment",
      isEvidence: false,
      summary: `could not run \`${command}\`: ${result.spawnError}`,
      output: "",
    };
  }

  if (result.timedOut) {
    return {
      outcome: "timeout",
      isEvidence: false,
      summary: `\`${command}\` did not finish in time`,
      output,
    };
  }

  if (result.exitCode === 0) {
    return {
      outcome: "pass",
      isEvidence: true,
      summary: `\`${command}\` passed in ${formatDuration(result.durationMs)}`,
      output,
    };
  }

  if (ENVIRONMENT_PATTERNS.some((pattern) => pattern.test(output))) {
    return {
      outcome: "environment",
      isEvidence: false,
      summary: `\`${command}\` failed to run — this looks like a setup problem, not the user's code`,
      output,
    };
  }

  return {
    outcome: "fail",
    isEvidence: true,
    summary: `\`${command}\` failed with exit code ${result.exitCode}`,
    output,
  };
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}
