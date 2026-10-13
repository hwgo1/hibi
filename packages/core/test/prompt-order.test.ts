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
import { testItem } from "./fixtures";

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

describe("session section", () => {
  test("lists open items with their ladder and marks the active one", async () => {
    const state = session();
    state.items = [
      testItem({
        attempts: 2,
        ladder: {
          entryStep: 1,
          step: 2,
          hintsGiven: 1,
          attemptsAtLastHint: 1,
          forced: false,
        },
      }),
    ];
    state.activeItemId = state.items[0]!.id;

    const prompt = await build(state);

    expect(prompt).toContain("* itm1 exercise worker-pool");
    expect(prompt).toContain("2 attempts · step 2/3, 1 hints");
  });

  test("leaves closed items out", async () => {
    const state = session();
    state.items = [testItem({ status: "done" })];

    expect(await build(state)).not.toContain("itm1");
  });

  test("flags an item untouched for three days as stale", async () => {
    const state = session();
    state.items = [testItem({ lastTouchedAt: "2025-12-28T12:00:00.000Z" })];

    expect(await build(state)).toContain("STALE");
  });
});
