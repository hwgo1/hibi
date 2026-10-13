import { describe, expect, test } from "bun:test";

import type { RepoModel } from "../src/schemas/repo";
import { buildToolRegistry, type ToolContext } from "../src/tools";
import { testContext } from "./fixtures";

const GO_REPO: RepoModel = {
  schemaVersion: 1,
  repoRoot: "/tmp/repo",
  indexedAt: "2026-01-01T00:00:00.000Z",
  hasGit: true,
  singleAuthor: true,
  subprojects: [
    {
      id: "root",
      path: ".",
      languages: ["Go"],
      entrypoints: [],
      dependencies: [],
      testCommand: "go test ./...",
      testRunner: "go",
    },
  ],
  fileStats: { total: 0, user: 0, external: 0, generated: 0, unknown: 0 },
  userAuthoredFiles: [],
  ignoredPatterns: [],
  treeSummary: "",
};

function contextFor(repo: RepoModel | null): ToolContext {
  const context = testContext();
  context.storage = {
    loadRepoModel: async () => repo,
  } as unknown as ToolContext["storage"];
  return context;
}

function propose(context: ToolContext, check: object) {
  return buildToolRegistry().execute(
    "propose_exercise",
    {
      conceptTerm: "string reversal",
      parentTerm: "algorithms",
      statement: "implement Reverse",
      targetFile: "strings/rev.go",
      check,
    },
    context,
  );
}

describe("propose_exercise with a check", () => {
  test("stores the check the project can run and says what verify will run", async () => {
    const context = contextFor(GO_REPO);

    const result = await propose(context, {
      file: "strings/rev_test.go",
      tests: ["TestReverse"],
    });

    expect(result.content).toContain(
      "verify will run go · strings/rev_test.go · TestReverse",
    );
    expect(context.session.intents[0]).toMatchObject({
      kind: "exercise",
      check: { runner: "go", cwd: ".", tests: ["TestReverse"] },
    });
  });

  test("an invalid check registers nothing, so a retry leaves no duplicate", async () => {
    const context = contextFor(GO_REPO);
    const conceptsBefore = context.registry.concepts.length;

    const result = await propose(context, { file: "strings/rev_test.go" });

    expect(result.isError).toBe(true);
    expect(context.session.intents).toHaveLength(0);
    expect(context.registry.concepts).toHaveLength(conceptsBefore);
  });

  test("without a way to run single tests, the exercise goes on without a check", async () => {
    const context = contextFor(null);

    const result = await propose(context, { tests: ["TestReverse"] });

    expect(result.content).toContain("No check attached");
    expect(context.session.intents[0]).toMatchObject({ kind: "exercise" });
    expect(
      context.session.intents[0]?.kind === "exercise" &&
        context.session.intents[0].check,
    ).toBeUndefined();
  });
});
