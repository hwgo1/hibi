import { describe, expect, test } from "bun:test";

import { TEST_RUNNER_SPECS } from "../src/verify/test-runners";

const { go, bun, vitest, jest, cargo, pytest } = TEST_RUNNER_SPECS;

/** `go test -json` output, one event per line, as the real runner prints it */
function goEvents(...events: object[]): string {
  return events.map((event) => JSON.stringify(event)).join("\n");
}

const PKG = "example.com/rev";

describe("argv", () => {
  test("go runs the named tests in the file's package, uncached, as JSON", () => {
    expect(
      go.argv({
        file: "strings/rev_test.go",
        tests: ["TestReverse", "TestEmpty"],
      }),
    ).toEqual([
      "go",
      "test",
      "-json",
      "-count=1",
      "-run",
      "^(TestReverse|TestEmpty)$",
      "./strings",
    ]);
  });

  test("go uses the subproject root package, or every package without a file", () => {
    expect(go.argv({ file: "rev_test.go", tests: ["TestX"] }).at(-1)).toBe(".");
    expect(go.argv({ tests: ["TestX"] }).at(-1)).toBe("./...");
  });

  test("bun scopes to the file and matches names literally", () => {
    expect(
      bun.argv({ file: "src/rev.test.ts", tests: ["adds (1+1)", "reverses"] }),
    ).toEqual([
      "bun",
      "test",
      "./src/rev.test.ts",
      "--test-name-pattern",
      "adds \\(1\\+1\\)|reverses",
    ]);
  });

  test("vitest and jest run the local binary and never download one", () => {
    expect(
      vitest.argv({ file: "src/rev.test.js", tests: ["reverses"] }),
    ).toEqual([
      "npm",
      "exec",
      "--no",
      "--",
      "vitest",
      "run",
      "src/rev.test.js",
      "-t",
      "reverses",
    ]);
    expect(jest.argv({ file: "src/rev.test.js", tests: [] })).toEqual([
      "npm",
      "exec",
      "--no",
      "--",
      "jest",
      "--runTestsByPath",
      "src/rev.test.js",
    ]);
  });

  test("cargo matches full test paths exactly and runs integration files alone", () => {
    expect(cargo.argv({ tests: ["tests::reverses"] })).toEqual([
      "cargo",
      "test",
      "--",
      "--exact",
      "tests::reverses",
    ]);
    expect(cargo.argv({ file: "tests/integ.rs", tests: [] })).toEqual([
      "cargo",
      "test",
      "--test",
      "integ",
      "--",
      "--exact",
    ]);
  });

  test("pytest uses node ids with a file and a keyword expression without one", () => {
    expect(
      pytest.argv({ file: "test_rev.py", tests: ["test_reverses"] }),
    ).toEqual([
      "pytest",
      "-q",
      "-p",
      "no:cacheprovider",
      "test_rev.py::test_reverses",
    ]);
    expect(pytest.argv({ tests: ["test_a", "test_b"] }).slice(-2)).toEqual([
      "-k",
      "test_a or test_b",
    ]);
  });
});

describe("validate", () => {
  test("go and cargo select unit tests only by name", () => {
    expect(go.validate({ file: "rev_test.go", tests: [] })).not.toBeNull();
    expect(cargo.validate({ file: "src/lib.rs", tests: [] })).not.toBeNull();
    expect(cargo.validate({ file: "tests/integ.rs", tests: [] })).toBeNull();
  });

  test("file-based runners take a file, names or both", () => {
    expect(bun.validate({ tests: [] })).not.toBeNull();
    expect(bun.validate({ file: "rev.test.ts", tests: [] })).toBeNull();
    expect(pytest.validate({ tests: ["test_x"] })).toBeNull();
  });

  test("pytest selects a class method only through its file", () => {
    expect(pytest.validate({ tests: ["TestRev::test_a"] })).not.toBeNull();
    expect(
      pytest.validate({ file: "test_rev.py", tests: ["TestRev::test_a"] }),
    ).toBeNull();
  });
});

describe("go.read", () => {
  test("counts top-level tests and leaves subtests to their parent", () => {
    const run = go.read(
      goEvents(
        { Action: "run", Package: PKG, Test: "TestReverse" },
        {
          Action: "output",
          Package: PKG,
          Test: "TestReverse",
          Output: "=== RUN   TestReverse\n",
        },
        { Action: "pass", Package: PKG, Test: "TestReverse/ascii", Elapsed: 0 },
        {
          Action: "output",
          Package: PKG,
          Test: "TestReverse",
          Output: "--- PASS: TestReverse (0.00s)\n",
        },
        { Action: "pass", Package: PKG, Test: "TestReverse", Elapsed: 0 },
        { Action: "pass", Package: PKG, Elapsed: 0.003 },
      ),
      "",
    );

    expect(run).toMatchObject({ passed: 1, failed: 0 });
    expect(run.output).toContain("--- PASS: TestReverse");
  });

  test("counts a failing test", () => {
    const run = go.read(
      goEvents(
        {
          Action: "output",
          Package: PKG,
          Test: "TestBroken",
          Output: '    rev_test.go:15: Reverse("ab") = "ba"\n',
        },
        { Action: "fail", Package: PKG, Test: "TestBroken", Elapsed: 0 },
        { Action: "fail", Package: PKG, Elapsed: 0.002 },
      ),
      "",
    );

    expect(run).toMatchObject({ passed: 0, failed: 1 });
  });

  test("a build failure runs no test and keeps the compiler output", () => {
    const run = go.read(
      goEvents(
        {
          ImportPath: `${PKG} [${PKG}.test]`,
          Action: "build-output",
          Output: "./broken.go:2:12: syntax error: unexpected {, expected )\n",
        },
        { ImportPath: `${PKG} [${PKG}.test]`, Action: "build-fail" },
        {
          Action: "output",
          Package: PKG,
          Output: `FAIL\t${PKG} [build failed]\n`,
        },
        { Action: "fail", Package: PKG, Elapsed: 0, FailedBuild: PKG },
      ),
      "",
    );

    expect(run).toMatchObject({ passed: 0, failed: 0 });
    expect(run.output).toContain("syntax error");
  });

  test("a missing package directory reads as no tests", () => {
    const output = "stat /repo/nope: directory not found\n";
    expect(go.noTests.some((pattern) => pattern.test(output))).toBe(true);
  });
});

describe("bun.read", () => {
  test("reads the pass and fail counts", () => {
    expect(
      bun.read(
        "bun test v1.4.2\n",
        "\n 1 pass\n 1 filtered out\n 0 fail\nRan 1 test across 1 file.\n",
      ),
    ).toMatchObject({ passed: 1, failed: 0 });
    expect(
      bun.read(
        "",
        "(fail) fails on purpose\n\n 0 pass\n 1 filtered out\n 1 fail\n",
      ),
    ).toMatchObject({ passed: 0, failed: 1 });
  });

  test("a file that fails to load is not a failed test", () => {
    const stderr =
      '# Unhandled error between tests\nerror: Expected identifier but found "="\n\n 0 pass\n 1 fail\n 1 error\nRan 1 test across 1 file.\n';
    expect(bun.read("", stderr)).toMatchObject({ passed: 0, failed: 0 });
  });

  test("recognizes its no-match messages", () => {
    const outputs = [
      'error: regex "nope" matched 0 tests. Searched 1 file (skipping 2 tests)',
      'Test filter "./missing.test.ts" had no matches in --cwd="/repo"',
    ];
    for (const output of outputs) {
      expect(bun.noTests.some((pattern) => pattern.test(output))).toBe(true);
    }
  });
});

describe("vitest.read and jest.read", () => {
  test("read the summary line, colored or not", () => {
    expect(
      vitest.read(
        " Test Files  1 passed (1)\n      Tests  1 passed | 1 skipped (2)\n",
        "",
      ),
    ).toMatchObject({ passed: 1, failed: 0 });
    expect(
      vitest.read(
        "\u001b[2m      Tests \u001b[22m \u001b[1m\u001b[31m1 failed\u001b[39m\u001b[22m | 1 skipped (2)\n",
        "",
      ),
    ).toMatchObject({ passed: 0, failed: 1 });
    expect(
      jest.read(
        "",
        "Test Suites: 1 failed, 1 total\nTests:       1 failed, 1 skipped, 2 total\n",
      ),
    ).toMatchObject({ passed: 0, failed: 1 });
  });

  test("a suite that fails to load reports no tests", () => {
    expect(
      vitest.read(" Test Files  1 failed (1)\n      Tests  no tests\n", ""),
    ).toMatchObject({ passed: 0, failed: 0 });
    expect(
      jest.read("", "Test Suites: 1 failed, 1 total\nTests:       0 total\n"),
    ).toMatchObject({ passed: 0, failed: 0 });
    expect(
      vitest.noTests.some((pattern) =>
        pattern.test("No test files found, exiting with code 1"),
      ),
    ).toBe(true);
  });
});

describe("cargo.read", () => {
  test("sums the result of every test binary", () => {
    const stdout = [
      "test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 1 filtered out; finished in 0.00s",
      "test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s",
      "test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s",
    ].join("\n\n");

    expect(cargo.read(stdout, "")).toMatchObject({ passed: 2, failed: 0 });
    expect(
      cargo.read(
        "test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 1 filtered out; finished in 0.09s\n",
        "",
      ),
    ).toMatchObject({ passed: 0, failed: 1 });
  });
});

describe("pytest.read", () => {
  test("reads the final summary in quiet and verbose form", () => {
    expect(pytest.read(".   [100%]\n1 passed in 0.01s\n", "")).toMatchObject({
      passed: 1,
      failed: 0,
    });
    expect(
      pytest.read(
        "FAILED test_rev.py::test_fails - AssertionError\n1 failed in 0.01s\n",
        "",
      ),
    ).toMatchObject({ passed: 0, failed: 1 });
    expect(
      pytest.read("===== 1 failed, 2 passed in 0.12s =====\n", ""),
    ).toMatchObject({ passed: 2, failed: 1 });
  });

  test("a collection error is not a test result", () => {
    const stdout =
      "E   SyntaxError: invalid syntax\n!!!! Interrupted: 1 error during collection !!!!\n1 error in 0.18s\n";
    expect(pytest.read(stdout, "")).toMatchObject({ passed: 0, failed: 0 });
  });

  test("recognizes its no-match messages", () => {
    for (const output of [
      "\nno tests ran in 0.00s\n",
      "\n2 deselected in 0.00s\n",
    ]) {
      expect(pytest.noTests.some((pattern) => pattern.test(output))).toBe(true);
    }
  });
});
