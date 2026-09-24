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
    const ctx = context();
    const intentId = await exerciseIn(ctx, "pool/pool.go");

    await buildToolRegistry().execute(
      "record_attempt",
      { intentId, outcome: "pass" },
      ctx,
    );

    expect(ctx.pendingEvidence.at(-1)?.filePath).toBe("pool/pool.go");
  });

  test("an explicit file wins over the exercise target", async () => {
    const ctx = context();
    const intentId = await exerciseIn(ctx, "pool/pool.go");

    await buildToolRegistry().execute(
      "record_attempt",
      { intentId, outcome: "fail", filePath: "pool/worker.go" },
      ctx,
    );

    expect(ctx.pendingEvidence.at(-1)?.filePath).toBe("pool/worker.go");
  });

  test("records model-judged provenance", async () => {
    const ctx = context();
    const intentId = await exerciseIn(ctx);

    await buildToolRegistry().execute(
      "record_attempt",
      { intentId, outcome: "pass" },
      ctx,
    );

    expect(ctx.pendingEvidence.at(-1)?.provenance).toBe("model_judged");
  });
});
