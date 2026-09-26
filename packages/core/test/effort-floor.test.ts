import { describe, expect, test } from "bun:test";

import type { ConceptId } from "../src/concepts";
import type { IntentId } from "../src/ids";
import { EFFORT_FLOOR, effortFloorMet } from "../src/policy/hint-ladder";
import type { ResolveIntent } from "../src/schemas/session";

const NOW = new Date("2026-01-01T12:00:00.000Z");
const clock = { now: () => NOW };

function intent(overrides: Partial<ResolveIntent> = {}): ResolveIntent {
  return {
    id: "int_1" as IntentId,
    kind: "resolve",
    conceptId: "linked-list" as ConceptId,
    target: { type: "exercise", intentId: "int_0" as IntentId },
    entryStep: 1,
    step: 1,
    attempts: 0,
    hintsGiven: 0,
    attemptsAtLastHint: 0,
    createdAt: NOW.toISOString(),
    lastTouchedAt: NOW.toISOString(),
    status: "active",
    userForcedDisclosure: false,
    ...overrides,
  };
}

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

describe("effortFloorMet", () => {
  test("blocks a hint asked for immediately, with nothing attempted", () => {
    const check = effortFloorMet({ intent: intent(), clock });

    expect(check.met).toBe(false);
    if (check.met) return;
    expect(check.remainingMs).toBeGreaterThan(0);
  });

  test("one attempt satisfies it regardless of elapsed time", () => {
    expect(effortFloorMet({ intent: intent({ attempts: 1 }), clock }).met).toBe(
      true,
    );
  });

  test("time alone satisfies it without any attempt", () => {
    const old = intent({
      createdAt: minutesAgo(EFFORT_FLOOR.minimumMs / 60_000 + 1),
    });
    expect(effortFloorMet({ intent: old, clock }).met).toBe(true);
  });

  test("does not apply once the ladder has started", () => {
    expect(
      effortFloorMet({ intent: intent({ hintsGiven: 1 }), clock }).met,
    ).toBe(true);
  });
});
