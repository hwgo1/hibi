import { posix } from "node:path";

import type { Check } from "../schemas/check";
import type { RepoModel, Subproject } from "../schemas/repo";
import { TEST_RUNNER_SPECS } from "./test-runners";

const MAX_CHECK_TESTS = 10;

const MAX_TEST_NAME_LENGTH = 200;

/** `file` is relative to the repository root */
export interface CheckRequest {
  subpath?: string;
  file?: string;
  tests?: string[];
}

export type CheckBuild =
  | { status: "ready"; check: Check }
  | { status: "unsupported"; reason: string }
  | { status: "invalid"; reason: string };

/** `unsupported`: the exercise goes on without a check. `invalid`: the request must be corrected */
export function buildCheck(
  repo: RepoModel | null,
  request: CheckRequest,
): CheckBuild {
  if (repo === null) {
    return {
      status: "unsupported",
      reason: "the repository is not indexed yet; the user can run /index",
    };
  }

  const file =
    request.file === undefined ? undefined : normalizePath(request.file);
  if (file === null || file === ".") {
    return {
      status: "invalid",
      reason: `not a file inside the repository: ${request.file}`,
    };
  }

  const subproject = pickSubproject(repo, request.subpath, file);
  if (typeof subproject === "string") {
    return { status: "invalid", reason: subproject };
  }

  const runner = subproject.testRunner;
  if (runner === undefined) {
    return {
      status: "unsupported",
      reason: `hibi cannot select single tests in ${subproject.path}`,
    };
  }

  const cwd = posixPath(subproject.path);
  const check: Check = {
    kind: "test",
    runner,
    cwd,
    file: file === undefined ? undefined : relativeTo(cwd, file),
    tests: request.tests ?? [],
  };

  const plan = planCheck(check);
  return plan.ok
    ? { status: "ready", check }
    : { status: "invalid", reason: plan.reason };
}

export type CheckPlan =
  | { ok: true; argv: string[] }
  | { ok: false; reason: string };

/** Single gate before anything runs: validates the check and derives its argv */
export function planCheck(check: Check): CheckPlan {
  const spec = TEST_RUNNER_SPECS[check.runner];

  if (normalizePath(check.cwd) !== check.cwd) {
    return { ok: false, reason: `not a subproject path: ${check.cwd}` };
  }
  if (check.file !== undefined && normalizePath(check.file) !== check.file) {
    return {
      ok: false,
      reason: `not a file inside the subproject: ${check.file}`,
    };
  }
  if (check.tests.length > MAX_CHECK_TESTS) {
    return {
      ok: false,
      reason: `at most ${MAX_CHECK_TESTS} test names per check`,
    };
  }

  const badName = check.tests.find(
    (test) =>
      test.startsWith("-") ||
      test.length > MAX_TEST_NAME_LENGTH ||
      !spec.name.test(test),
  );
  if (badName !== undefined) {
    return {
      ok: false,
      reason: `not a valid ${check.runner} test name: ${badName}`,
    };
  }

  const selection = { file: check.file, tests: check.tests };
  const problem = spec.validate(selection);
  return problem === null
    ? { ok: true, argv: spec.argv(selection) }
    : { ok: false, reason: problem };
}

/** Relative to the repository root */
export function checkFile(check: Check): string | undefined {
  if (check.file === undefined) return undefined;
  return check.cwd === "." ? check.file : `${check.cwd}/${check.file}`;
}

export function describeCheck(check: Check): string {
  const file = checkFile(check);
  return [
    check.runner,
    ...(file === undefined ? [] : [file]),
    ...(check.tests.length === 0 ? [] : [check.tests.join(", ")]),
  ].join(" · ");
}

function pickSubproject(
  repo: RepoModel,
  subpath: string | undefined,
  file: string | undefined,
): Subproject | string {
  if (subpath !== undefined) {
    const wanted = normalizePath(subpath);
    const match = repo.subprojects.find(
      (subproject) => posixPath(subproject.path) === wanted,
    );
    return match ?? `unknown subproject: ${subpath}`;
  }

  if (file !== undefined) {
    const owner = repo.subprojects
      .filter((subproject) => contains(posixPath(subproject.path), file))
      .sort((a, b) => b.path.length - a.path.length)[0];
    return owner ?? `no subproject contains ${file}`;
  }

  const testable = repo.subprojects.filter(
    (subproject) => subproject.testRunner !== undefined,
  );
  const only =
    testable.length === 1
      ? testable[0]
      : repo.subprojects.length === 1
        ? repo.subprojects[0]
        : undefined;
  return only ?? "the repository has several subprojects: pass subpath";
}

/** null when the path escapes the repository or reads as a flag */
function normalizePath(path: string): string | null {
  const normalized = posix.normalize(path.replaceAll("\\", "/"));
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) return null;
  if (normalized === ".." || normalized.startsWith("../")) return null;

  const trimmed = normalized.replace(/\/+$/, "");
  return trimmed.startsWith("-") ? null : trimmed;
}

/** The indexer stores platform separators */
function posixPath(path: string): string {
  return normalizePath(path) ?? path;
}

function contains(dir: string, file: string): boolean {
  return dir === "." || file.startsWith(`${dir}/`);
}

function relativeTo(dir: string, file: string): string {
  return dir === "." ? file : file.slice(dir.length + 1);
}
