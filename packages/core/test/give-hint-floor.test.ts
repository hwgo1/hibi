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
    const ctx = context();
    const intentId = await openExercise(ctx);

    const result = await buildToolRegistry().execute(
      "give_hint",
      { targetIntentId: intentId },
      ctx,
    );

    expect(result.content).toContain("Too early");
    expect(ctx.pendingEvidence.some((e) => e.kind === "hint_given")).toBe(
      false,
    );
  });

  test("an explicit request for the answer bypasses the floor", async () => {
    const ctx = context();
    const intentId = await openExercise(ctx);

    const result = await buildToolRegistry().execute(
      "give_hint",
      { targetIntentId: intentId, userRequestedFullAnswer: true },
      ctx,
    );

    expect(result.content).toContain("Step 3");
    expect(ctx.pendingEvidence.some((e) => e.kind === "hint_given")).toBe(true);
  });
});
