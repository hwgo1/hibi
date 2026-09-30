import { describe, expect, test } from "bun:test";

import type { ConceptId } from "../src/concepts";
import { buildToolRegistry } from "../src/tools";
import { testContext, TEST_NOW } from "./fixtures";

describe("set_goal", () => {
  test("records the objective on the learner, not the session", async () => {
    const ctx = testContext();

    await buildToolRegistry().execute(
      "set_goal",
      { kind: "language", statement: "aprender Go", language: "Go" },
      ctx,
    );

    expect(ctx.learner.goal?.statement).toBe("aprender Go");
    expect(ctx.learner.goal?.language).toBe("Go");
  });

  test("asks one question when there is no history to work from", async () => {
    const ctx = testContext();

    const result = await buildToolRegistry().execute(
      "set_goal",
      { kind: "language", statement: "aprender Go" },
      ctx,
    );

    expect(result.content).toContain("One question");
  });

  test("proposes steps when the registry has something to work on", async () => {
    const ctx = testContext();
    ctx.registry.concepts.push({
      id: "goroutines" as ConceptId,
      canonicalName: "goroutines",
      aliases: [],
      parentId: "concurrency" as ConceptId,
      source: "proposed",
      createdAt: TEST_NOW.toISOString(),
      mergedInto: null,
    });

    const result = await buildToolRegistry().execute(
      "set_goal",
      { kind: "language", statement: "aprender Go" },
      ctx,
    );

    expect(result.content).toContain("goroutines");
    expect(result.content).toContain("recomputed every session");
  });

  test("says when it replaces a previous objective", async () => {
    const ctx = testContext();
    const registry = buildToolRegistry();

    await registry.execute(
      "set_goal",
      { kind: "language", statement: "aprender Go" },
      ctx,
    );
    const second = await registry.execute(
      "set_goal",
      { kind: "language", statement: "aprender Rust" },
      ctx,
    );

    expect(second.content).toContain("aprender Go");
    expect(ctx.learner.goal?.statement).toBe("aprender Rust");
  });
});

describe("next_steps", () => {
  test("says nothing is set when there is no objective", async () => {
    const result = await buildToolRegistry().execute(
      "next_steps",
      {},
      testContext(),
    );
    expect(result.content).toContain("No objective");
  });

  test("returns the objective once one exists", async () => {
    const ctx = testContext();
    const registry = buildToolRegistry();

    await registry.execute(
      "set_goal",
      { kind: "language", statement: "aprender Go" },
      ctx,
    );
    const result = await registry.execute("next_steps", {}, ctx);

    expect(result.content).toContain("aprender Go");
  });
});

describe("skip_concept", () => {
  test("accepts the claim without testing and stops proposing it", async () => {
    const ctx = testContext();
    const registry = buildToolRegistry();

    await registry.execute(
      "set_goal",
      { kind: "language", statement: "aprender Go" },
      ctx,
    );
    await registry.execute("skip_concept", { conceptTerm: "concurrency" }, ctx);

    expect(ctx.learner.goal?.skipped).toContain("concurrency" as ConceptId);
    expect(ctx.pendingEvidence.at(-1)?.provenance).toBe("self_declared");
  });

  test("errors without an objective", async () => {
    const result = await buildToolRegistry().execute(
      "skip_concept",
      { conceptTerm: "concurrency" },
      testContext(),
    );

    expect(result.isError).toBe(true);
  });
});
