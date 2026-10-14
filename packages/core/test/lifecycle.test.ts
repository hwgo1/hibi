import { describe, expect, test } from "bun:test";

import type { ItemId } from "../src/ids";
import {
  isIdle,
  renewSession,
  SESSION_IDLE_MS,
} from "../src/session/lifecycle";
import { TEST_NOW, testItem, testSession } from "./fixtures";

const later = (ms: number) => new Date(TEST_NOW.getTime() + ms);

function used() {
  const session = testSession();
  session.turnCount = 12;
  session.lastElicitedTurn = 10;
  session.elicitationsAsked = 6;
  session.consecutiveIgnored = 2;
  session.contextFiles = ["pool.go"];
  session.pending = {
    type: "question",
    schemaVersion: 1,
    kind: "recap",
    conceptId: "concurrency" as never,
    question: "e aí?",
    askedAt: TEST_NOW.toISOString(),
  };
  return session;
}

describe("isIdle", () => {
  test("a pause shorter than the threshold continues the session", () => {
    expect(isIdle(used(), later(SESSION_IDLE_MS - 1))).toBe(false);
  });

  test("a long pause ends it", () => {
    expect(isIdle(used(), later(SESSION_IDLE_MS))).toBe(true);
  });

  test("a session that never had a turn is not idle", () => {
    expect(isIdle(testSession(), later(SESSION_IDLE_MS * 10))).toBe(false);
  });
});

describe("renewSession", () => {
  test("resets pacing and drops what was pending", () => {
    const renewed = renewSession(used());

    expect(renewed).toMatchObject({
      lastElicitedTurn: null,
      elicitationsAsked: 0,
      consecutiveIgnored: 0,
      pending: null,
      contextFiles: [],
      turnCount: 12,
    });
  });

  test("keeps open exercises and only the latest closed ones", () => {
    const session = used();
    session.items = [
      testItem({ id: "open" as ItemId }),
      ...Array.from({ length: 15 }, (_, index) =>
        testItem({ id: `done${index}` as ItemId, status: "done" }),
      ),
    ];

    const renewed = renewSession(session);

    expect(renewed.items).toHaveLength(11);
    expect(renewed.items[0]?.id).toBe("open" as ItemId);
    expect(renewed.items.at(-1)?.id).toBe("done14" as ItemId);
  });
});
