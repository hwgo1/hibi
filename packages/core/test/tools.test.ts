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
  test("logs the explanation without opening an item and asks for a check", async () => {
    const ctx = testContext();
    const result = await buildToolRegistry().execute(
      "explain_concept",
      { conceptTerm: "concurrency" },
      ctx,
    );

    expect(ctx.session.items).toHaveLength(0);
    expect(ctx.pendingEvidence[0]!.kind).toBe("concept_explained");
    expect(result.content).toContain("check of understanding");
  });
});

describe("give_hint", () => {
  test("starts the ladder on the exercise after an attempt", async () => {
    const ctx = testContext();
    const registry = buildToolRegistry();

    await registry.execute(
      "propose_exercise",
      { conceptTerm: "concurrency", statement: "build X" },
      ctx,
    );
    const itemId = ctx.session.items[0]!.id;

    await registry.execute("record_attempt", { itemId, outcome: "fail" }, ctx);
    const result = await registry.execute("give_hint", { itemId }, ctx);

    expect(result.content).toContain("Step");
    expect(ctx.session.items).toHaveLength(1);
    expect(ctx.session.items[0]!.ladder?.hintsGiven).toBe(1);
  });

  test("a direct request for the answer jumps to step 3 and marks it forced", async () => {
    const ctx = testContext();
    const registry = buildToolRegistry();

    await registry.execute(
      "propose_exercise",
      { conceptTerm: "concurrency", statement: "build X" },
      ctx,
    );
    const itemId = ctx.session.items[0]!.id;

    await registry.execute(
      "give_hint",
      { itemId, userRequestedFullAnswer: true },
      ctx,
    );

    expect(ctx.session.items[0]!.ladder).toMatchObject({
      step: 3,
      forced: true,
    });
    expect(ctx.pendingEvidence.at(-1)).toMatchObject({
      kind: "hint_given",
      forced: true,
    });
  });
});

describe("abandon_item", () => {
  test("closes the exercise, clears it as active and logs it", async () => {
    const ctx = testContext();
    const registry = buildToolRegistry();

    await registry.execute(
      "propose_exercise",
      { conceptTerm: "concurrency", statement: "build X" },
      ctx,
    );
    const itemId = ctx.session.items[0]!.id;

    await registry.execute(
      "abandon_item",
      { itemId, reason: "outro dia" },
      ctx,
    );

    expect(ctx.session.items[0]!.status).toBe("abandoned");
    expect(ctx.session.activeItemId).toBeNull();
    expect(ctx.pendingEvidence.at(-1)).toMatchObject({
      kind: "item_abandoned",
      provenance: "system",
      note: "outro dia",
    });
  });

  test("an abandoned exercise takes no more attempts", async () => {
    const ctx = testContext();
    const registry = buildToolRegistry();

    await registry.execute(
      "propose_exercise",
      { conceptTerm: "concurrency", statement: "build X" },
      ctx,
    );
    const itemId = ctx.session.items[0]!.id;
    await registry.execute("abandon_item", { itemId }, ctx);

    const result = await registry.execute(
      "record_attempt",
      { itemId, outcome: "pass" },
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(result.content).toContain("abandoned");
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
      "abandon_item",
    ]) {
      expect(names).toContain(expected);
    }
  });
});
