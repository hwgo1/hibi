import { describe, expect, test } from "bun:test";

import type { ConceptId } from "../src/concepts";
import type { IntentId } from "../src/ids";
import type { Check } from "../src/schemas/check";
import type {
  ExerciseIntent,
  Intent,
  ResolveIntent,
} from "../src/schemas/session";
import { buildToolRegistry, type ToolContext } from "../src/tools";
import { TEST_NOW, testContext } from "./fixtures";

const CONCEPT = "worker-pool" as ConceptId;
const AT = TEST_NOW.toISOString();

function exercise(id: string, check?: Check): ExerciseIntent {
  return {
    id: id as IntentId,
    kind: "exercise",
    conceptId: CONCEPT,
    statement: "build a worker pool",
    check,
    createdAt: AT,
    lastTouchedAt: AT,
    status: "active",
  };
}

function ladder(
  id: string,
  exerciseId: string,
  step: 1 | 2 | 3,
): ResolveIntent {
  return {
    id: id as IntentId,
    kind: "resolve",
    conceptId: CONCEPT,
    target: { type: "exercise", intentId: exerciseId as IntentId },
    entryStep: 1,
    step,
    attempts: 0,
    hintsGiven: 1,
    attemptsAtLastHint: 0,
    createdAt: AT,
    lastTouchedAt: AT,
    status: "active",
    userForcedDisclosure: false,
  };
}

function contextWith(...intents: Intent[]): ToolContext {
  const context = testContext();
  context.session.intents.push(...intents);
  return context;
}

async function exerciseIn(
  ctx: ToolContext,
  targetFile?: string,
): Promise<string> {
  await buildToolRegistry().execute(
    "propose_exercise",
    {
      conceptTerm: "concurrency",
      statement: "build a worker pool",
      targetFile,
    },
    ctx,
  );
  return ctx.session.intents[0]!.id;
}

describe("record_attempt", () => {
  test("falls back to the exercise's target file", async () => {
    const ctx = testContext();
    const intentId = await exerciseIn(ctx, "pool/pool.go");

    await buildToolRegistry().execute(
      "record_attempt",
      { intentId, outcome: "pass" },
      ctx,
    );

    expect(ctx.pendingEvidence.at(-1)?.filePath).toBe("pool/pool.go");
  });

  test("an explicit file wins over the exercise target", async () => {
    const ctx = testContext();
    const intentId = await exerciseIn(ctx, "pool/pool.go");

    await buildToolRegistry().execute(
      "record_attempt",
      { intentId, outcome: "fail", filePath: "pool/worker.go" },
      ctx,
    );

    expect(ctx.pendingEvidence.at(-1)?.filePath).toBe("pool/worker.go");
  });

  test("records model-judged provenance", async () => {
    const ctx = testContext();
    const intentId = await exerciseIn(ctx);

    await buildToolRegistry().execute(
      "record_attempt",
      { intentId, outcome: "pass" },
      ctx,
    );

    expect(ctx.pendingEvidence.at(-1)?.provenance).toBe("model_judged");
  });

  test("refuses an exercise with a check: only verify decides it", async () => {
    const context = contextWith(
      exercise("ex1", {
        kind: "test",
        runner: "go",
        cwd: ".",
        tests: ["TestPool"],
      }),
    );

    const result = await buildToolRegistry().execute(
      "record_attempt",
      { intentId: "ex1", outcome: "pass" },
      context,
    );

    expect(result.isError).toBe(true);
    expect(context.pendingEvidence).toHaveLength(0);
    expect(context.session.intents[0]?.status).toBe("active");
  });

  test("accepts the ladder id and counts the attempt on that ladder only", async () => {
    const context = contextWith(
      exercise("ex1"),
      ladder("lad1", "ex1", 1),
      exercise("ex2"),
      ladder("lad2", "ex2", 2),
    );

    await buildToolRegistry().execute(
      "record_attempt",
      { intentId: "lad2", outcome: "fail" },
      context,
    );

    const attempts = context.session.intents
      .filter((intent): intent is ResolveIntent => intent.kind === "resolve")
      .map((intent) => intent.attempts);
    expect(attempts).toEqual([0, 1]);
    expect(context.pendingEvidence[0]?.helpDepth).toBe(2);
  });

  test("refuses an intent that is not an exercise", async () => {
    const context = contextWith({
      id: "exp1" as IntentId,
      kind: "explain",
      conceptId: CONCEPT,
      createdAt: AT,
      lastTouchedAt: AT,
      status: "active",
    });

    const result = await buildToolRegistry().execute(
      "record_attempt",
      { intentId: "exp1", outcome: "pass" },
      context,
    );

    expect(result.isError).toBe(true);
    expect(context.session.intents[0]?.status).toBe("active");
  });

  test("a passed exercise does not collect evidence twice", async () => {
    const context = contextWith(exercise("ex1"));
    const registry = buildToolRegistry();

    await registry.execute(
      "record_attempt",
      { intentId: "ex1", outcome: "pass" },
      context,
    );
    const again = await registry.execute(
      "record_attempt",
      { intentId: "ex1", outcome: "pass" },
      context,
    );

    expect(again.isError).toBe(true);
    expect(context.pendingEvidence).toHaveLength(1);
  });
});
