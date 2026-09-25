import { describe, expect, test } from "bun:test";

import { seedRegistry } from "../src/concepts";
import type { SessionId, UserId } from "../src/ids";
import type { Workspace } from "../src/ports/workspace";
import {
  DEFAULT_TEACHING_PREFERENCES,
  type LearnerModel,
} from "../src/schemas/learner";
import type { SessionState } from "../src/schemas/session";
import { buildToolRegistry, type ToolContext } from "../src/tools";

const NOW = new Date("2026-01-01T12:00:00.000Z");

const workspace: Workspace = {
  root: "/tmp/repo",
  async listFiles() {
    return { entries: [], truncated: false };
  },
  async readFile(path) {
    return { path, text: "x", contentHash: "h", dirty: false };
  },
  async activeDocument() {
    return null;
  },
};

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
    workspace,
    storage: {} as ToolContext["storage"],
    clock: { now: () => NOW },
    pendingEvidence: [],
  };
}

describe("read_file", () => {
  test("keeps only the most recent files pinned", async () => {
    const ctx = context();
    const registry = buildToolRegistry();

    for (const path of ["a.go", "b.go", "c.go", "d.go"]) {
      await registry.execute("read_file", { path }, ctx);
    }

    expect(ctx.session.contextFiles).toEqual(["b.go", "c.go", "d.go"]);
  });

  test("re-reading a file moves it to the end instead of duplicating it", async () => {
    const ctx = context();
    const registry = buildToolRegistry();

    await registry.execute("read_file", { path: "a.go" }, ctx);
    await registry.execute("read_file", { path: "b.go" }, ctx);
    await registry.execute("read_file", { path: "a.go" }, ctx);

    expect(ctx.session.contextFiles).toEqual(["b.go", "a.go"]);
  });
});
