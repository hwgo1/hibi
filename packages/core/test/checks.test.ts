import { describe, expect, test } from "bun:test";

import type { Check } from "../src/schemas/check";
import type { RepoModel, Subproject } from "../src/schemas/repo";
import {
  buildCheck,
  checkFile,
  describeCheck,
  planCheck,
  runnerOf,
} from "../src/verify/checks";

function subproject(path: string, extra: Partial<Subproject> = {}): Subproject {
  return {
    id: path === "." ? "root" : path.replaceAll("/", "-"),
    path,
    languages: [],
    entrypoints: [],
    dependencies: [],
    ...extra,
  };
}

function repo(...subprojects: Subproject[]): RepoModel {
  return {
    schemaVersion: 1,
    repoRoot: "/repo",
    indexedAt: "2026-01-01T00:00:00.000Z",
    hasGit: true,
    singleAuthor: true,
    subprojects,
    fileStats: { total: 0, user: 0, external: 0, generated: 0, unknown: 0 },
    userAuthoredFiles: [],
    ignoredPatterns: [],
    treeSummary: "",
  };
}

const goRepo = repo(
  subproject(".", { testCommand: "go test ./...", testRunner: "go" }),
);

const fullStack = repo(
  subproject("backend", { testRunner: "go" }),
  subproject("frontend", { testRunner: "vitest" }),
);

describe("buildCheck", () => {
  test("scopes a Go check to the named tests", () => {
    expect(
      buildCheck(goRepo, {
        file: "strings/rev_test.go",
        tests: ["TestReverse"],
      }),
    ).toEqual({
      status: "ready",
      check: {
        kind: "test",
        runner: "go",
        cwd: ".",
        file: "strings/rev_test.go",
        tests: ["TestReverse"],
      },
    });
  });

  test("places the check in the subproject that owns the file", () => {
    const built = buildCheck(fullStack, { file: "frontend/src/cart.test.ts" });

    expect(built.status === "ready" && built.check).toMatchObject({
      runner: "vitest",
      cwd: "frontend",
      file: "src/cart.test.ts",
    });
  });

  test("needs subpath when several subprojects could run it", () => {
    expect(buildCheck(fullStack, { tests: ["TestCart"] }).status).toBe(
      "invalid",
    );
    expect(
      buildCheck(fullStack, { subpath: "backend", tests: ["TestCart"] }).status,
    ).toBe("ready");
  });

  test("accepts Windows separators", () => {
    const built = buildCheck(goRepo, {
      file: "strings\\rev_test.go",
      tests: ["TestReverse"],
    });
    expect(built.status === "ready" && built.check.file).toBe(
      "strings/rev_test.go",
    );
  });

  test("refuses paths that leave the repository or read as flags", () => {
    for (const file of [
      "../secret_test.go",
      "/etc/passwd",
      "C:/x_test.go",
      "-rf",
      ".",
    ]) {
      expect(buildCheck(goRepo, { file, tests: ["TestX"] }).status).toBe(
        "invalid",
      );
    }
  });

  test("refuses test names the runner would read as flags or patterns", () => {
    expect(buildCheck(goRepo, { tests: ["-exec=sh"] }).status).toBe("invalid");
    expect(buildCheck(goRepo, { tests: ["Test Reverse"] }).status).toBe(
      "invalid",
    );
    expect(buildCheck(goRepo, { tests: ["Test.*"] }).status).toBe("invalid");
  });

  test("lets the exercise go on without a check when tests cannot be selected", () => {
    const unknownRunner = repo(subproject(".", { testCommand: "npm test" }));

    expect(
      buildCheck(unknownRunner, { file: "test/cart.spec.js" }).status,
    ).toBe("unsupported");
    expect(buildCheck(null, { tests: ["TestX"] }).status).toBe("unsupported");
  });
});

describe("runnerOf", () => {
  test("infers the runner of repositories indexed before testRunner existed", () => {
    expect(runnerOf(subproject(".", { testCommand: "go test ./..." }))).toBe(
      "go",
    );
    expect(
      runnerOf(subproject(".", { testCommand: "npm test" })),
    ).toBeUndefined();
  });
});

describe("planCheck", () => {
  test("rejects a stored check edited to leave the subproject", () => {
    const plan = planCheck({
      kind: "test",
      runner: "bun",
      cwd: ".",
      file: "../../outside.test.ts",
      tests: [],
    });
    expect(plan.ok).toBe(false);
  });

  test("caps the number of test names", () => {
    const tests = Array.from({ length: 11 }, (_, index) => `Test${index}`);
    expect(planCheck({ kind: "test", runner: "go", cwd: ".", tests }).ok).toBe(
      false,
    );
  });
});

describe("checkFile and describeCheck", () => {
  test("name the test file from the repository root", () => {
    const check: Check = {
      kind: "test",
      runner: "go",
      cwd: "backend",
      file: "api/rev_test.go",
      tests: ["TestReverse", "TestEmpty"],
    };

    expect(checkFile(check)).toBe("backend/api/rev_test.go");
    expect(describeCheck(check)).toBe(
      "go · backend/api/rev_test.go · TestReverse, TestEmpty",
    );
  });
});
