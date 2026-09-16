import { describe, expect, test } from "bun:test";

import {
  creditMultiplier,
  deriveEntryStep,
  nextStep,
} from "../src/policy/hint-ladder";
import type { IntentId } from "../src/ids";
import type { ConceptId } from "../src/concepts";
import type { ResolveIntent } from "../src/schemas/session";

const NOW = new Date("2026-01-01T12:00:00.000Z");
const clock = { now: () => NOW };

function resolveIntent(overrides: Partial<ResolveIntent> = {}): ResolveIntent {
  return {
    id: "int_1" as IntentId,
    kind: "resolve",
    conceptId: "linked-list" as ConceptId,
    target: { type: "exercise", intentId: "int_0" as IntentId },
    entryStep: 1,
    step: 1,
    attempts: 0,
    attemptsAtLastHint: 0,
    hintsGiven: 0,
    createdAt: NOW.toISOString(),
    lastTouchedAt: NOW.toISOString(),
    status: "active",
    userForcedDisclosure: false,
    ...overrides,
  };
}

describe("deriveEntryStep", () => {
  test("an empty file always starts at step 1", () => {
    expect(
      deriveEntryStep({
        hasExistingCode: false,
        questionIsSpecific: true,
        masteryLevel: 0.9,
        selfReportedAttempts: 5,
      }),
    ).toBe(1);
  });

  test("a specific question over existing work skips the region hint", () => {
    expect(
      deriveEntryStep({
        hasExistingCode: true,
        questionIsSpecific: true,
        masteryLevel: 0.2,
        selfReportedAttempts: 3,
      }),
    ).toBe(2);
  });

  test("vague question over existing work still starts at step 1", () => {
    expect(
      deriveEntryStep({
        hasExistingCode: true,
        questionIsSpecific: false,
        masteryLevel: 0.2,
        selfReportedAttempts: 0,
      }),
    ).toBe(1);
  });
});

describe("nextStep", () => {
  test("holds the step until attempts accumulate", () => {
    const intent = resolveIntent({ step: 1, hintsGiven: 1, attempts: 1 });
    expect(nextStep({ intent, userRequested: false, clock })).toBe(1);
  });

  test("climbs after enough attempts at the same step", () => {
    const intent = resolveIntent({ step: 1, hintsGiven: 1, attempts: 2 });
    expect(nextStep({ intent, userRequested: false, clock })).toBe(2);
  });

  test("climbs when stuck long enough without new attempts", () => {
    const intent = resolveIntent({
      step: 1,
      hintsGiven: 1,
      attempts: 0,
      lastHintAt: new Date(NOW.getTime() - 10 * 60 * 1000).toISOString(),
    });
    expect(nextStep({ intent, userRequested: false, clock })).toBe(2);
  });

  test("never descends", () => {
    const intent = resolveIntent({ step: 3, hintsGiven: 1, attempts: 0 });
    expect(nextStep({ intent, userRequested: false, clock })).toBe(3);
  });

  test("jumps to the correction when the user asks outright", () => {
    const intent = resolveIntent({ step: 1, hintsGiven: 0, attempts: 0 });
    expect(nextStep({ intent, userRequested: true, clock })).toBe(3);
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
