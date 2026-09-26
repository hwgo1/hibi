import { describe, expect, test } from "bun:test";

import { buildToolRegistry, type ToolContext } from "../src/tools";
import { testContext } from "./fixtures";

async function openExercise(ctx: ToolContext): Promise<string> {
  await buildToolRegistry().execute(
    "propose_exercise",
    { conceptTerm: "concurrency", statement: "build a worker pool" },
    ctx,
  );
  return ctx.session.intents[0]!.id;
}

describe("give_hint effort floor", () => {
  test("redirects instead of hinting when nothing has been attempted", async () => {
    const ctx = testContext();
    const intentId = await openExercise(ctx);

    const result = await buildToolRegistry().execute(
      "give_hint",
      { targetIntentId: intentId },
      ctx,
    );

    expect(result.content).toContain("Too early");
    expect(
      ctx.pendingEvidence.some((evidence) => evidence.kind === "hint_given"),
    ).toBe(false);
  });

  test("an explicit request for the answer bypasses the floor", async () => {
    const ctx = testContext();
    const intentId = await openExercise(ctx);

    const result = await buildToolRegistry().execute(
      "give_hint",
      { targetIntentId: intentId, userRequestedFullAnswer: true },
      ctx,
    );

    expect(result.content).toContain("Step 3");
    expect(
      ctx.pendingEvidence.some((evidence) => evidence.kind === "hint_given"),
    ).toBe(true);
  });
});
