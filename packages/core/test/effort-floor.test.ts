import { describe, expect, test } from "bun:test";

import { EFFORT_FLOOR, effortFloorMet } from "../src/policy/hint-ladder";
import { TEST_NOW, testItem } from "./fixtures";

const clock = { now: () => TEST_NOW };

function minutesAgo(minutes: number): string {
  return new Date(TEST_NOW.getTime() - minutes * 60_000).toISOString();
}

describe("effortFloorMet", () => {
  test("blocks a hint asked for immediately, with nothing attempted", () => {
    const check = effortFloorMet({ item: testItem(), clock });

    expect(check.met).toBe(false);
    if (check.met) return;
    expect(check.remainingMs).toBeGreaterThan(0);
  });

  test("one attempt satisfies it regardless of elapsed time", () => {
    expect(effortFloorMet({ item: testItem({ attempts: 1 }), clock }).met).toBe(
      true,
    );
  });

  test("counts time from when the exercise was set", () => {
    const old = testItem({
      createdAt: minutesAgo(EFFORT_FLOOR.minimumMs / 60_000 + 1),
    });
    expect(effortFloorMet({ item: old, clock }).met).toBe(true);
  });

  test("does not apply once the ladder has started", () => {
    const item = testItem({
      ladder: {
        entryStep: 1,
        step: 1,
        hintsGiven: 1,
        attemptsAtLastHint: 0,
        forced: false,
      },
    });
    expect(effortFloorMet({ item, clock }).met).toBe(true);
  });

  test("saving the exercise file counts as engaging with it", () => {
    const once = testItem({ edits: EFFORT_FLOOR.orAfterEdits - 1 });
    const enough = testItem({ edits: EFFORT_FLOOR.orAfterEdits });

    expect(effortFloorMet({ item: once, clock }).met).toBe(false);
    expect(effortFloorMet({ item: enough, clock }).met).toBe(true);
  });
});
