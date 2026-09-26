import { describe, expect, test } from "bun:test";

import { buildToolRegistry, type ToolContext } from "../src/tools";
import { testContext } from "./fixtures";

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
});
