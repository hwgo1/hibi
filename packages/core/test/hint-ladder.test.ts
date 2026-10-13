import { describe, expect, test } from "bun:test";

import {
  creditMultiplier,
  deriveEntryStep,
  nextStep,
} from "../src/policy/hint-ladder";
import type { Ladder } from "../src/schemas/session";

const NOW = new Date("2026-01-01T12:00:00.000Z");
const clock = { now: () => NOW };

function ladder(overrides: Partial<Ladder> = {}): Ladder {
  return {
    entryStep: 1,
    step: 1,
    hintsGiven: 0,
    attemptsAtLastHint: 0,
    forced: false,
    ...overrides,
  };
}

describe("deriveEntryStep", () => {
  test("starts at step 1 without attempts or mastery", () => {
    expect(deriveEntryStep({ masteryLevel: null, attempts: 0 })).toBe(1);
  });

  test("two attempts skip the region hint", () => {
    expect(deriveEntryStep({ masteryLevel: 0.2, attempts: 2 })).toBe(2);
  });

  test("solid mastery skips the region hint", () => {
    expect(deriveEntryStep({ masteryLevel: 0.6, attempts: 0 })).toBe(2);
  });
});

describe("nextStep", () => {
  test("holds the step until attempts accumulate", () => {
    expect(
      nextStep({
        ladder: ladder({ hintsGiven: 1 }),
        attempts: 1,
        userRequested: false,
        clock,
      }),
    ).toBe(1);
  });

  test("climbs after enough attempts at the same step", () => {
    expect(
      nextStep({
        ladder: ladder({ hintsGiven: 1 }),
        attempts: 2,
        userRequested: false,
        clock,
      }),
    ).toBe(2);
  });

  test("climbs when stuck long enough without new attempts", () => {
    expect(
      nextStep({
        ladder: ladder({
          hintsGiven: 1,
          lastHintAt: new Date(NOW.getTime() - 10 * 60 * 1000).toISOString(),
        }),
        attempts: 0,
        userRequested: false,
        clock,
      }),
    ).toBe(2);
  });

  test("never descends", () => {
    expect(
      nextStep({
        ladder: ladder({ step: 3, hintsGiven: 1 }),
        attempts: 0,
        userRequested: false,
        clock,
      }),
    ).toBe(3);
  });

  test("jumps to the correction when the user asks outright", () => {
    expect(
      nextStep({ ladder: ladder(), attempts: 0, userRequested: true, clock }),
    ).toBe(3);
  });
});

describe("creditMultiplier", () => {
  test("credits less as the ladder climbs", () => {
    expect(creditMultiplier(1, false)).toBeGreaterThan(
      creditMultiplier(2, false),
    );
    expect(creditMultiplier(2, false)).toBeGreaterThan(
      creditMultiplier(3, false),
    );
  });

  test("forced disclosure credits less than the same step unforced", () => {
    expect(creditMultiplier(3, true)).toBeLessThan(creditMultiplier(3, false));
  });
});
