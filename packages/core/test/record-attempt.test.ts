import { describe, expect, test } from "bun:test";

import type { ItemId } from "../src/ids";
import type { WorkItem } from "../src/schemas/session";
import { buildToolRegistry, type ToolContext } from "../src/tools";
import { testContext, testItem } from "./fixtures";

function contextWith(...items: WorkItem[]): ToolContext {
  const context = testContext();
  context.session.items.push(...items);
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
  return ctx.session.items[0]!.id;
}

describe("record_attempt", () => {
  test("falls back to the exercise's target file", async () => {
    const ctx = testContext();
    const itemId = await exerciseIn(ctx, "pool/pool.go");

    await buildToolRegistry().execute(
      "record_attempt",
      { itemId, outcome: "pass" },
      ctx,
    );

    expect(ctx.pendingEvidence.at(-1)?.filePath).toBe("pool/pool.go");
  });

  test("an explicit file wins over the exercise target", async () => {
    const ctx = testContext();
    const itemId = await exerciseIn(ctx, "pool/pool.go");

    await buildToolRegistry().execute(
      "record_attempt",
      { itemId, outcome: "fail", filePath: "pool/worker.go" },
      ctx,
    );

    expect(ctx.pendingEvidence.at(-1)?.filePath).toBe("pool/worker.go");
  });

  test("records model-judged provenance", async () => {
    const ctx = testContext();
    const itemId = await exerciseIn(ctx);

    await buildToolRegistry().execute(
      "record_attempt",
      { itemId, outcome: "pass" },
      ctx,
    );

    expect(ctx.pendingEvidence.at(-1)?.provenance).toBe("model_judged");
  });

  test("refuses an exercise with a check: only verify decides it", async () => {
    const context = contextWith(
      testItem({
        check: { kind: "test", runner: "go", cwd: ".", tests: ["TestPool"] },
      }),
    );

    const result = await buildToolRegistry().execute(
      "record_attempt",
      { itemId: "itm1", outcome: "pass" },
      context,
    );

    expect(result.isError).toBe(true);
    expect(context.pendingEvidence).toHaveLength(0);
    expect(context.session.items[0]?.status).toBe("active");
  });

  test("counts the attempt on that item only and credits its ladder depth", async () => {
    const context = contextWith(
      testItem({ id: "itm1" as ItemId }),
      testItem({
        id: "itm2" as ItemId,
        ladder: {
          entryStep: 1,
          step: 2,
          hintsGiven: 2,
          attemptsAtLastHint: 0,
          forced: true,
        },
      }),
    );

    await buildToolRegistry().execute(
      "record_attempt",
      { itemId: "itm2", outcome: "fail" },
      context,
    );

    expect(context.session.items.map((item) => item.attempts)).toEqual([0, 1]);
    expect(context.pendingEvidence[0]).toMatchObject({
      helpDepth: 2,
      forced: true,
    });
  });

  test("a passed exercise does not collect evidence twice", async () => {
    const context = contextWith(testItem());
    const registry = buildToolRegistry();

    await registry.execute(
      "record_attempt",
      { itemId: "itm1", outcome: "pass" },
      context,
    );
    const again = await registry.execute(
      "record_attempt",
      { itemId: "itm1", outcome: "pass" },
      context,
    );

    expect(again.isError).toBe(true);
    expect(context.session.items[0]?.status).toBe("done");
    expect(context.pendingEvidence).toHaveLength(1);
  });
});
