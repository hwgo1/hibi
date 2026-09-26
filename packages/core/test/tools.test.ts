import { describe, expect, test } from "bun:test";

import { seedRegistry } from "../src/concepts";
import type { SessionId, UserId } from "../src/ids";
import {
  DEFAULT_TEACHING_PREFERENCES,
  type LearnerModel,
} from "../src/schemas/learner";
import type { SessionState } from "../src/schemas/session";
import { buildToolRegistry, type ToolContext } from "../src/tools";

const NOW = new Date("2026-01-01T12:00:00.000Z");

function context(): ToolContext {
  const session: SessionState = {
    schemaVersion: 1,
    sessionId: "s1" as SessionId,
    userId: "local" as UserId,
    repoRoot: "/tmp/repo",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    intents: [],
    activeIntentId: null,
    findings: [],
    contextFiles: [],
    turnCount: 0,
  };

  const learner: LearnerModel = {
    schemaVersion: 1,
    userId: "local" as UserId,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    preferences: DEFAULT_TEACHING_PREFERENCES,
    mastery: [],
    recurringErrors: [],
    inferredSignals: [],
  };

  return {
    session,
    learner,
    registry: seedRegistry(NOW),
    workspace: {} as ToolContext["workspace"],
    storage: {} as ToolContext["storage"],
    clock: { now: () => NOW },
    pendingEvidence: [],
  };
}

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

  test("an unknown tool returns an error result instead of throwing", async () => {
    const result = await buildToolRegistry().execute("nope", {}, context());
    expect(result.isError).toBe(true);
  });
});

describe("explain_concept", () => {
  test("creates an intent with no ladder and resolves the term", async () => {
    const ctx = context();
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
    const ctx = context();
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
    const ctx = context();
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
