import { describe, expect, test } from "bun:test";

import { seedRegistry } from "../src/concepts";
import type { SessionId, UserId } from "../src/ids";
import type { Workspace } from "../src/ports/workspace";
import {
  DEFAULT_TEACHING_PREFERENCES,
  type LearnerModel,
} from "../src/schemas/learner";
import type { SessionState } from "../src/schemas/session";
import { buildSystemPrompt } from "../src/session/prompt";
import { newSessionState } from "../src/session/tutor-session";

const NOW = new Date("2026-01-01T12:00:00.000Z");

const workspace: Workspace = {
  root: "/tmp/repo",
  async listFiles() {
    return { entries: [], truncated: false };
  },
  async readFile(path) {
    return { path, text: "package main\n", contentHash: "x", dirty: false };
  },
  async activeDocument() {
    return null;
  },
};

function learner(): LearnerModel {
  return {
    schemaVersion: 1,
    userId: "local" as UserId,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    preferences: { ...DEFAULT_TEACHING_PREFERENCES },
    goal: null,
    mastery: [],
    recurringErrors: [],
    inferredSignals: [],
  };
}

function session(): SessionState {
  return newSessionState(
    "s1" as SessionId,
    "local" as UserId,
    "/tmp/repo",
    NOW,
  );
}

async function build(state: SessionState): Promise<string> {
  return buildSystemPrompt({
    learner: learner(),
    session: state,
    registry: seedRegistry(NOW),
    repo: null,
    workspace,
    now: NOW,
  });
}

describe("system prompt", () => {
  test("puts the session last, after the stable sections", async () => {
    const prompt = await build(session());

    expect(prompt.indexOf("<concepts>")).toBeLessThan(
      prompt.indexOf("<session>"),
    );
    expect(prompt.indexOf("<learner>")).toBeLessThan(
      prompt.indexOf("<session>"),
    );
  });

  test("carries no turn counter, which would change the prefix every call", async () => {
    const state = session();
    state.turnCount = 7;

    expect(await build(state)).not.toContain("turn: 7");
  });

  test("keeps an identical prefix across turns when only the turn count changes", async () => {
    const first = session();
    const second = session();
    second.turnCount = 3;

    expect(await build(first)).toBe(await build(second));
  });
});
