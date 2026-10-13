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
import type { IntentId } from "../src/ids";
import type { Check } from "../src/schemas/check";
import type { ExerciseIntent, ResolveIntent } from "../src/schemas/session";
import { buildToolRegistry, type ToolContext } from "../src/tools";
import { TEST_NOW, testContext } from "./fixtures";

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

function exercise(id: string, check?: Check): ExerciseIntent {
  return {
    id: id as IntentId,
    kind: "exercise",
    conceptId: CONCEPT,
    statement: "reverse a string",
    check,
    createdAt: AT,
    lastTouchedAt: AT,
    status: "active",
  };
}

function ladder(id: string, exerciseId: string): ResolveIntent {
  return {
    id: id as IntentId,
    kind: "resolve",
    conceptId: CONCEPT,
    target: { type: "exercise", intentId: exerciseId as IntentId },
    entryStep: 1,
    step: 1,
    attempts: 0,
    hintsGiven: 1,
    attemptsAtLastHint: 0,
    createdAt: AT,
    lastTouchedAt: AT,
    status: "active",
    userForcedDisclosure: false,
  };
}

function contextWith(
  ...intents: Array<ExerciseIntent | ResolveIntent>
): ToolContext {
  const context = testContext();
  context.session.repoRoot = root;
  context.workspace = new WorkspaceFs(root);
  context.session.intents.push(...intents);
  context.session.activeIntentId = intents[0]?.id ?? null;
  return context;
}

function verify(context: ToolContext, intentId?: string) {
  return buildToolRegistry().execute(
    "verify",
    intentId === undefined ? {} : { intentId },
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
    expect(context.session.intents[0]?.status).toBe("done");
  });

  test("records a fail and keeps the exercise open", async () => {
    const context = contextWith(
      exercise("ex1", bunCheck(["fails on purpose"])),
    );

    await verify(context);

    expect(context.pendingEvidence[0]?.outcome).toBe("fail");
    expect(context.session.intents[0]?.status).toBe("active");
  });

  test("a check that matches no test is not a result", async () => {
    const context = contextWith(exercise("ex1", bunCheck(["does not exist"])));

    const result = await verify(context);

    expect(result.content).toContain("ran no tests");
    expect(context.pendingEvidence).toHaveLength(0);
    expect(context.session.intents[0]?.status).toBe("active");
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

  test("attempts land on the ladder of the verified exercise only", async () => {
    const context = contextWith(
      exercise("ex1", bunCheck(["fails on purpose"])),
      ladder("lad1", "ex1"),
      exercise("ex2", bunCheck(["fails on purpose"])),
      ladder("lad2", "ex2"),
    );

    await verify(context, "ex2");

    const attempts = context.session.intents
      .filter((intent): intent is ResolveIntent => intent.kind === "resolve")
      .map((intent) => intent.attempts);
    expect(attempts).toEqual([0, 1]);
    expect(context.pendingEvidence[0]?.helpDepth).toBe(1);
  });

  test("accepts the ladder id in place of the exercise id", async () => {
    const context = contextWith(
      exercise("ex1", bunCheck(["reverses a word"])),
      ladder("lad1", "ex1"),
    );

    await verify(context, "lad1");

    expect(context.session.intents.map((intent) => intent.status)).toEqual([
      "done",
      "done",
    ]);
  });

  test("a prediction is consumed only by a run that decided something", async () => {
    const pending = exercise("ex1", bunCheck(["does not exist"]));
    const context = contextWith(pending);
    context.session.pendingPrediction = {
      conceptId: CONCEPT,
      predicted: "pass",
      madeAt: AT,
    };

    await verify(context);
    expect(context.session.pendingPrediction).not.toBeNull();

    pending.check = bunCheck(["fails on purpose"]);
    const result = await verify(context);

    expect(context.session.pendingPrediction).toBeNull();
    expect(context.pendingEvidence[0]?.predicted).toBe("pass");
    expect(result.content).toContain("They predicted pass and it failed");
  });
});
