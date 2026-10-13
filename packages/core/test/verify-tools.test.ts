import {
  afterAll,
  beforeAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { WorkspaceFs } from "../src/adapters/workspace-fs";
import type { ConceptId } from "../src/concepts";
import type { ItemId } from "../src/ids";
import type { Check } from "../src/schemas/check";
import type { WorkItem } from "../src/schemas/session";
import { buildToolRegistry, type ToolContext } from "../src/tools";
import { TEST_NOW, testContext, testItem } from "./fixtures";

/** Each case spawns a real `bun test` against a throwaway project */
setDefaultTimeout(20_000);

const SPEC = [
  'import { expect, test } from "bun:test";',
  "",
  'test("reverses a word", () => {',
  '  expect([..."abc"].reverse().join("")).toBe("cba");',
  "});",
  "",
  'test("fails on purpose", () => {',
  "  expect(1).toBe(2);",
  "});",
  "",
].join("\n");

const CONCEPT = "string-reversal" as ConceptId;
const AT = TEST_NOW.toISOString();

let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "hibi-verify-"));
  await writeFile(join(root, "package.json"), '{ "name": "fixture" }');
  await writeFile(join(root, "rev.test.ts"), SPEC);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

function bunCheck(tests: string[], file = "rev.test.ts"): Check {
  return { kind: "test", runner: "bun", cwd: ".", file, tests };
}

function exercise(
  id: string,
  check?: Check,
  overrides: Partial<WorkItem> = {},
): WorkItem {
  return testItem({
    id: id as ItemId,
    conceptId: CONCEPT,
    statement: "reverse a string",
    check,
    ...overrides,
  });
}

function contextWith(...items: WorkItem[]): ToolContext {
  const context = testContext();
  context.session.repoRoot = root;
  context.workspace = new WorkspaceFs(root);
  context.session.items.push(...items);
  context.session.activeItemId = items[0]?.id ?? null;
  return context;
}

function verify(context: ToolContext, itemId?: string) {
  return buildToolRegistry().execute(
    "verify",
    itemId === undefined ? {} : { itemId },
    context,
  );
}

describe("verify", () => {
  test("records a pass and closes the exercise when its tests pass", async () => {
    const context = contextWith(exercise("ex1", bunCheck(["reverses a word"])));

    const result = await verify(context);

    expect(result.content).toContain("1 passed, 0 failed");
    expect(context.pendingEvidence).toEqual([
      expect.objectContaining({
        kind: "test_run",
        provenance: "execution",
        outcome: "pass",
        filePath: "rev.test.ts",
      }),
    ]);
    expect(context.session.items[0]?.status).toBe("done");
  });

  test("records a fail and keeps the exercise open", async () => {
    const context = contextWith(
      exercise("ex1", bunCheck(["fails on purpose"])),
    );

    await verify(context);

    expect(context.pendingEvidence[0]?.outcome).toBe("fail");
    expect(context.session.items[0]?.status).toBe("active");
  });

  test("a check that matches no test is not a result", async () => {
    const context = contextWith(exercise("ex1", bunCheck(["does not exist"])));

    const result = await verify(context);

    expect(result.content).toContain("ran no tests");
    expect(context.pendingEvidence).toHaveLength(0);
    expect(context.session.items[0]?.status).toBe("active");
  });

  test("a missing test file is reported before anything runs", async () => {
    const context = contextWith(exercise("ex1", bunCheck([], "cart.test.ts")));

    const result = await verify(context);

    expect(result.content).toContain("cart.test.ts does not exist yet");
    expect(context.pendingEvidence).toHaveLength(0);
  });

  test("an exercise without a check runs nothing and points to record_attempt", async () => {
    const context = contextWith(exercise("ex1"));

    const result = await verify(context);

    expect(result.isError).toBe(true);
    expect(result.content).toContain("record_attempt");
    expect(context.pendingEvidence).toHaveLength(0);
  });

  test("attempts land on the verified exercise only, with its ladder depth", async () => {
    const context = contextWith(
      exercise("ex1", bunCheck(["fails on purpose"])),
      exercise("ex2", bunCheck(["fails on purpose"]), {
        ladder: {
          entryStep: 1,
          step: 2,
          hintsGiven: 1,
          attemptsAtLastHint: 0,
          forced: false,
        },
      }),
    );

    await verify(context, "ex2");

    expect(context.session.items.map((item) => item.attempts)).toEqual([0, 1]);
    expect(context.pendingEvidence[0]?.helpDepth).toBe(2);
  });

  test("a closed exercise is not verified again", async () => {
    const context = contextWith(
      exercise("ex1", bunCheck(["reverses a word"]), { status: "done" }),
    );

    const result = await verify(context);

    expect(result.isError).toBe(true);
    expect(context.pendingEvidence).toHaveLength(0);
  });

  test("a prediction is consumed only by a run that decided something", async () => {
    const pending = exercise("ex1", bunCheck(["does not exist"]), {
      prediction: { predicted: "pass", madeAt: AT },
    });
    const context = contextWith(pending);

    await verify(context);
    expect(pending.prediction).toBeDefined();

    pending.check = bunCheck(["fails on purpose"]);
    const result = await verify(context);

    expect(pending.prediction).toBeUndefined();
    expect(context.pendingEvidence[0]?.predicted).toBe("pass");
    expect(result.content).toContain("They predicted pass and it failed");
  });
});
