import { describe, expect, test } from "bun:test";

import { buildToolRegistry } from "../src/tools";
import { testContext } from "./fixtures";

describe("tool surface", () => {
  test("exposes no tool that writes a solution", () => {
    const names = buildToolRegistry()
      .definitions()
      .map((definition) => definition.name);

    expect(names).not.toContain("write_solution");
    expect(names).not.toContain("fix_code");
  });

  test("give_hint takes no depth argument", () => {
    const hint = buildToolRegistry()
      .definitions()
      .find((definition) => definition.name === "give_hint")!;

    const properties = (
      hint.parameters as { properties: Record<string, unknown> }
    ).properties;
    expect(Object.keys(properties)).not.toContain("step");
    expect(Object.keys(properties)).not.toContain("level");
  });

  test("no tool sets a mastery estimate directly", () => {
    const names = buildToolRegistry()
      .definitions()
      .map((definition) => definition.name);

    expect(names).not.toContain("set_mastery");
    expect(names).not.toContain("update_mastery");
  });

  test("an unknown tool returns an error result instead of throwing", async () => {
    const result = await buildToolRegistry().execute("nope", {}, testContext());
    expect(result.isError).toBe(true);
  });
});

describe("explain_concept", () => {
  test("creates an intent with no ladder and resolves the term", async () => {
    const ctx = testContext();
    await buildToolRegistry().execute(
      "explain_concept",
      { conceptTerm: "concurrency" },
      ctx,
    );

    expect(ctx.session.intents).toHaveLength(1);
    expect(ctx.session.intents[0]!.kind).toBe("explain");
    expect(ctx.pendingEvidence[0]!.kind).toBe("concept_explained");
  });
});

describe("give_hint", () => {
  test("creates a resolve intent and returns a depth instruction after an attempt", async () => {
    const ctx = testContext();
    const registry = buildToolRegistry();

    await registry.execute(
      "propose_exercise",
      { conceptTerm: "concurrency", statement: "build X" },
      ctx,
    );
    const exerciseId = ctx.session.intents[0]!.id;

    await registry.execute(
      "record_attempt",
      { intentId: exerciseId, outcome: "fail" },
      ctx,
    );

    const result = await registry.execute(
      "give_hint",
      { targetIntentId: exerciseId },
      ctx,
    );

    expect(result.content).toContain("Step");
    expect(
      ctx.session.intents.some((intent) => intent.kind === "resolve"),
    ).toBe(true);
  });

  test("a direct request for the answer jumps to step 3 and marks disclosure", async () => {
    const ctx = testContext();
    const registry = buildToolRegistry();

    await registry.execute(
      "propose_exercise",
      { conceptTerm: "concurrency", statement: "build X" },
      ctx,
    );
    const exerciseId = ctx.session.intents[0]!.id;

    await registry.execute(
      "give_hint",
      { targetIntentId: exerciseId, userRequestedFullAnswer: true },
      ctx,
    );

    const resolveIntent = ctx.session.intents.find(
      (intent) => intent.kind === "resolve",
    );
    expect(resolveIntent?.kind === "resolve" && resolveIntent.step).toBe(3);
    expect(
      resolveIntent?.kind === "resolve" && resolveIntent.userForcedDisclosure,
    ).toBe(true);
  });
});

describe("tool surface", () => {
  test("registers every tool the rules reference", () => {
    const names = buildToolRegistry()
      .definitions()
      .map((definition) => definition.name);

    for (const expected of [
      "explain_concept",
      "demonstrate_code",
      "propose_exercise",
      "give_hint",
      "ask_learner",
      "record_answer",
      "ask_quiz",
      "answer_quiz",
      "dispute_mastery",
      "set_goal",
      "next_steps",
      "skip_concept",
      "verify",
      "list_files",
      "read_file",
      "record_attempt",
    ]) {
      expect(names).toContain(expected);
    }
  });
});
