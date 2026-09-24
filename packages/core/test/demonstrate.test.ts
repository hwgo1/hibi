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

describe("demonstrate_code", () => {
  test("records what was shown as a system event, not mastery", async () => {
    const ctx = context();
    const result = await buildToolRegistry().execute(
      "demonstrate_code",
      { conceptTerm: "tooling", subject: "a GitHub Actions workflow" },
      ctx,
    );

    expect(result.isError).toBeUndefined();
    expect(ctx.session.intents[0]?.kind).toBe("demonstrate");
    expect(ctx.pendingEvidence[0]?.kind).toBe("code_demonstrated");
    expect(ctx.pendingEvidence[0]?.provenance).toBe("system");
  });

  test("refuses while an exercise on the same concept is open", async () => {
    const ctx = context();
    const registry = buildToolRegistry();

    await registry.execute(
      "propose_exercise",
      { conceptTerm: "concurrency", statement: "build a worker pool" },
      ctx,
    );
    const result = await registry.execute(
      "demonstrate_code",
      { conceptTerm: "concurrency", subject: "a worker pool" },
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(
      ctx.session.intents.some((intent) => intent.kind === "demonstrate"),
    ).toBe(false);
  });
});
