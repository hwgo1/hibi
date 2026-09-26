import { seedRegistry } from "../src/concepts";
import type { SessionId, UserId } from "../src/ids";
import {
  DEFAULT_TEACHING_PREFERENCES,
  type LearnerModel,
} from "../src/schemas/learner";
import type { SessionState } from "../src/schemas/session";
import type { ToolContext } from "../src/tools";

export const TEST_NOW = new Date("2026-01-01T12:00:00.000Z");
export const TEST_USER = "local" as UserId;

export function testSession(now: Date = TEST_NOW): SessionState {
  const at = now.toISOString();
  return {
    schemaVersion: 1,
    sessionId: "s1" as SessionId,
    userId: TEST_USER,
    repoRoot: "/tmp/repo",
    createdAt: at,
    updatedAt: at,
    intents: [],
    activeIntentId: null,
    findings: [],
    contextFiles: [],
    openQuiz: null,
    disputes: [],
    turnCount: 0,
  };
}

export function testLearner(now: Date = TEST_NOW): LearnerModel {
  const at = now.toISOString();
  return {
    schemaVersion: 1,
    userId: TEST_USER,
    createdAt: at,
    updatedAt: at,
    preferences: DEFAULT_TEACHING_PREFERENCES,
    mastery: [],
    recurringErrors: [],
    inferredSignals: [],
  };
}

export function testContext(now: Date = TEST_NOW): ToolContext {
  return {
    session: testSession(now),
    learner: testLearner(now),
    registry: seedRegistry(now),
    workspace: {} as ToolContext["workspace"],
    storage: {} as ToolContext["storage"],
    clock: { now: () => now },
    pendingEvidence: [],
  };
}
