import { posix } from "node:path";

import type { TestRunner } from "../schemas/check";

/** `file` is relative to the subproject */
export interface TestSelection {
  file?: string;
  tests: string[];
}

export interface RunSummary {
  passed: number;
  failed: number;
  output: string;
}

export interface TestRunnerSpec {
  name: RegExp;
  validate(selection: TestSelection): string | null;
  argv(selection: TestSelection): string[];
  read(stdout: string, stderr: string): RunSummary;
  /** Matched only when no test ran */
  noTests: readonly RegExp[];
}

const IDENTIFIER = /^[A-Za-z_]\w*$/;
const QUALIFIED = /^[A-Za-z_]\w*(?:::[A-Za-z_]\w*)*$/;
const FREE_TEXT = /^[^\r\n]+$/;
const ANSI = /\u001b\[[0-9;]*m/g;

/** Local binary only; never downloads a missing one */
const NPM_EXEC = ["npm", "exec", "--no", "--"];

export const TEST_RUNNER_SPECS: Record<TestRunner, TestRunnerSpec> = {
  go: {
    name: IDENTIFIER,
    validate: (selection) =>
      selection.tests.length === 0
        ? "go selects tests by name: pass the test function names"
        : null,
    argv: (selection) => [
      "go",
      "test",
      "-json",
      "-count=1",
      "-run",
      `^(${selection.tests.join("|")})$`,
      selection.file === undefined ? "./..." : goPackage(selection.file),
    ],
    read: readGoJson,
    noTests: [/: directory not found/],
  },

  bun: {
    name: FREE_TEXT,
    validate: requireFileOrTests,
    argv: (selection) => [
      "bun",
      "test",
      ...(selection.file === undefined ? [] : [`./${selection.file}`]),
      ...namePattern("--test-name-pattern", selection.tests),
    ],
    read: readBun,
    noTests: [/matched 0 tests/, /had no matches/],
  },

  vitest: {
    name: FREE_TEXT,
    validate: requireFileOrTests,
    argv: (selection) => [
      ...NPM_EXEC,
      "vitest",
      "run",
      ...(selection.file === undefined ? [] : [selection.file]),
      ...namePattern("-t", selection.tests),
    ],
    read: (stdout, stderr) =>
      readSummaryLine(/^\s*Tests\s+(.+)$/m, stdout, stderr),
    noTests: [/No test files found/],
  },

  jest: {
    name: FREE_TEXT,
    validate: requireFileOrTests,
    argv: (selection) => [
      ...NPM_EXEC,
      "jest",
      ...(selection.file === undefined
        ? []
        : ["--runTestsByPath", selection.file]),
      ...namePattern("-t", selection.tests),
    ],
    read: (stdout, stderr) =>
      readSummaryLine(/^Tests:\s+(.+)$/m, stdout, stderr),
    noTests: [/No tests found/],
  },

  cargo: {
    name: QUALIFIED,
    validate: (selection) =>
      selection.file !== undefined && cargoTarget(selection.file) === null
        ? "cargo selects a file only under tests/; pass test names for unit tests"
        : requireFileOrTests(selection),
    argv: (selection) => {
      const target =
        selection.file === undefined ? null : cargoTarget(selection.file);
      return [
        "cargo",
        "test",
        ...(target === null ? [] : ["--test", target]),
        "--",
        "--exact",
        ...selection.tests,
      ];
    },
    read: readCargo,
    noTests: [],
  },

  pytest: {
    name: QUALIFIED,
    validate: (selection) =>
      selection.file === undefined &&
      selection.tests.some((test) => test.includes("::"))
        ? "pytest selects a class method only with its file: pass the file"
        : requireFileOrTests(selection),
    argv: (selection) => [
      "pytest",
      "-q",
      "-p",
      "no:cacheprovider",
      ...pytestTargets(selection),
    ],
    read: readPytest,
    noTests: [/no tests ran/, /\bdeselected in [\d.]+s/],
  },
};

function requireFileOrTests(selection: TestSelection): string | null {
  return selection.file === undefined && selection.tests.length === 0
    ? "pass a test file, test names or both"
    : null;
}

function namePattern(flag: string, tests: string[]): string[] {
  return tests.length === 0 ? [] : [flag, tests.map(escapeRegExp).join("|")];
}

function goPackage(file: string): string {
  const dir = posix.dirname(file);
  return dir === "." ? "." : `./${dir}`;
}

function cargoTarget(file: string): string | null {
  return /^tests\/([\w-]+)\.rs$/.exec(file)?.[1] ?? null;
}

function pytestTargets(selection: TestSelection): string[] {
  const { file, tests } = selection;
  if (file === undefined) return ["-k", tests.join(" or ")];
  if (tests.length === 0) return [file];
  return tests.map((test) => `${file}::${test}`);
}

interface GoEvent {
  Action?: string;
  Test?: string;
  Output?: string;
}

/** Counts top-level tests only; subtests roll up into their parent */
function readGoJson(stdout: string, stderr: string): RunSummary {
  let passed = 0;
  let failed = 0;
  const output: string[] = [];

  for (const line of stdout.split("\n")) {
    if (line.trim().length === 0) continue;

    const event = parseGoEvent(line);
    if (event === null) {
      output.push(`${line}\n`);
      continue;
    }

    if (typeof event.Output === "string") output.push(event.Output);
    if (event.Test === undefined || event.Test.includes("/")) continue;
    if (event.Action === "pass") passed += 1;
    if (event.Action === "fail") failed += 1;
  }

  return { passed, failed, output: output.join("") + stderr };
}

function parseGoEvent(line: string): GoEvent | null {
  if (!line.startsWith("{")) return null;
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === "object" && value !== null
      ? (value as GoEvent)
      : null;
  } catch {
    return null;
  }
}

/** A file that fails to load shows up as one failed test plus an error, so any error zeroes the counts */
function readBun(stdout: string, stderr: string): RunSummary {
  const output = plain(stdout, stderr);
  if (count(/^\s*(\d+) errors?$/m, output) > 0) {
    return { passed: 0, failed: 0, output };
  }

  return {
    passed: count(/^\s*(\d+) pass$/m, output),
    failed: count(/^\s*(\d+) fail$/m, output),
    output,
  };
}

function readSummaryLine(
  line: RegExp,
  stdout: string,
  stderr: string,
): RunSummary {
  const output = plain(stdout, stderr);
  const summary = line.exec(output)?.[1] ?? "";

  return {
    passed: count(/(\d+) passed/, summary),
    failed: count(/(\d+) failed/, summary),
    output,
  };
}

function readCargo(stdout: string, stderr: string): RunSummary {
  const output = plain(stdout, stderr);
  let passed = 0;
  let failed = 0;

  for (const match of output.matchAll(
    /test result: \w+\. (\d+) passed; (\d+) failed/g,
  )) {
    passed += Number(match[1] ?? 0);
    failed += Number(match[2] ?? 0);
  }

  return { passed, failed, output };
}

/** Collection errors are not test results */
function readPytest(stdout: string, stderr: string): RunSummary {
  const output = plain(stdout, stderr);
  const summaries = [...output.matchAll(/^=*\s*(\d+ \w+.*?) in [\d.]+s/gm)];
  const summary = summaries.at(-1)?.[1] ?? "";

  return {
    passed: count(/(\d+) passed/, summary),
    failed: count(/(\d+) failed/, summary),
    output,
  };
}

function plain(stdout: string, stderr: string): string {
  return `${stdout}\n${stderr}`.replace(ANSI, "");
}

function count(pattern: RegExp, text: string): number {
  const value = pattern.exec(text)?.[1];
  return value === undefined ? 0 : Number.parseInt(value, 10);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
