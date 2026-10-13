import { describe, expect, test } from "bun:test";

import { buildToolRegistry, type ToolContext } from "../src/tools";
import { testContext } from "./fixtures";

async function openExercise(ctx: ToolContext): Promise<string> {
  await buildToolRegistry().execute(
    "propose_exercise",
    { conceptTerm: "concurrency", statement: "build a worker pool" },
    ctx,
  );
  return ctx.session.items[0]!.id;
}

describe("give_hint effort floor", () => {
  test("redirects instead of hinting when nothing has been attempted", async () => {
    const ctx = testContext();
    const itemId = await openExercise(ctx);

    const result = await buildToolRegistry().execute(
      "give_hint",
      { itemId },
      ctx,
    );

    expect(result.content).toContain("Too early");
    expect(ctx.session.items[0]?.ladder).toBeUndefined();
    expect(
      ctx.pendingEvidence.some((evidence) => evidence.kind === "hint_given"),
    ).toBe(false);
  });

  test("an explicit request for the answer bypasses the floor and is marked forced", async () => {
    const ctx = testContext();
    const itemId = await openExercise(ctx);

    const result = await buildToolRegistry().execute(
      "give_hint",
      { itemId, userRequestedFullAnswer: true },
      ctx,
    );

    expect(result.content).toContain("Step 3");
    expect(ctx.session.items[0]?.ladder?.forced).toBe(true);
    expect(ctx.pendingEvidence.at(-1)).toMatchObject({
      kind: "hint_given",
      forced: true,
    });
  });
});

describe("give_hint ladder", () => {
  test("attempts from earlier turns count: two failures then a hint start at step 2", async () => {
    const ctx = testContext();
    const itemId = await openExercise(ctx);
    ctx.session.items[0]!.attempts = 2;

    const result = await buildToolRegistry().execute(
      "give_hint",
      { itemId },
      ctx,
    );

    expect(result.content).toContain("Step 2");
  });

  test("hinting twice keeps one ladder on the item", async () => {
    const ctx = testContext();
    const itemId = await openExercise(ctx);
    ctx.session.items[0]!.attempts = 1;
    const registry = buildToolRegistry();

    await registry.execute("give_hint", { itemId }, ctx);
    ctx.session.items[0]!.attempts = 3;
    const second = await registry.execute("give_hint", { itemId }, ctx);

    expect(second.content).toContain("Step 2");
    expect(ctx.session.items[0]?.ladder?.hintsGiven).toBe(2);
    expect(ctx.session.items).toHaveLength(1);
  });

  test("refuses a closed exercise", async () => {
    const ctx = testContext();
    const itemId = await openExercise(ctx);
    ctx.session.items[0]!.status = "done";

    const result = await buildToolRegistry().execute(
      "give_hint",
      { itemId, userRequestedFullAnswer: true },
      ctx,
    );

    expect(result.isError).toBe(true);
  });
});
