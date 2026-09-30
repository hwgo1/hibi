import { describe, expect, test } from "bun:test";

import type { ConceptId, ConceptRegistry } from "../src/concepts";
import { seedRegistry } from "../src/concepts";
import { deriveNextSteps } from "../src/goal/next-steps";
import type { Goal } from "../src/schemas/goal";
import type { MasteryEntry } from "../src/schemas/learner";
import { testLearner, TEST_NOW } from "./fixtures";

function registryWith(ids: string[]): ConceptRegistry {
  const base = seedRegistry(TEST_NOW);
  return {
    ...base,
    concepts: [
      ...base.concepts,
      ...ids.map((id) => ({
        id: id as ConceptId,
        canonicalName: id,
        aliases: [],
        parentId: "concurrency" as ConceptId,
        source: "proposed" as const,
        createdAt: TEST_NOW.toISOString(),
        mergedInto: null,
      })),
    ],
  };
}

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    schemaVersion: 1,
    kind: "language",
    statement: "aprender Go",
    language: "Go",
    skipped: [],
    createdAt: TEST_NOW.toISOString(),
    lastTouchedAt: TEST_NOW.toISOString(),
    status: "active",
    ...overrides,
  };
}

function mastery(
  conceptId: string,
  overrides: Partial<MasteryEntry> = {},
): MasteryEntry {
  return {
    conceptId: conceptId as ConceptId,
    level: 0.9,
    confidence: 0.8,
    directEvidenceCount: 5,
    rolledUpEvidenceCount: 0,
    computedAt: TEST_NOW.toISOString(),
    formulaVersion: 2,
    lastSeenAt: TEST_NOW.toISOString(),
    ...overrides,
  };
}

describe("deriveNextSteps", () => {
  test("proposes at most three", () => {
    const steps = deriveNextSteps(
      goal(),
      testLearner(),
      registryWith(["goroutines", "channels", "mutexes", "contexts"]),
      TEST_NOW,
    );

    expect(steps.length).toBeLessThanOrEqual(3);
  });

  test("never proposes a root, which is a category rather than a topic", () => {
    const steps = deriveNextSteps(
      goal(),
      testLearner(),
      seedRegistry(TEST_NOW),
      TEST_NOW,
    );
    expect(
      steps.some((step) => step.conceptId === ("backend" as ConceptId)),
    ).toBe(false);
  });

  test("leaves out what the learner said they already know", () => {
    const steps = deriveNextSteps(
      goal({ skipped: ["goroutines" as ConceptId] }),
      testLearner(),
      registryWith(["goroutines", "channels"]),
      TEST_NOW,
    );

    expect(
      steps.some((step) => step.conceptId === ("goroutines" as ConceptId)),
    ).toBe(false);
  });

  test("leaves out what is already known well and recently", () => {
    const learner = testLearner();
    learner.mastery = [mastery("goroutines")];

    const steps = deriveNextSteps(
      goal(),
      learner,
      registryWith(["goroutines"]),
      TEST_NOW,
    );
    expect(steps).toHaveLength(0);
  });

  test("flags a concept claimed but never demonstrated", () => {
    const learner = testLearner();
    learner.mastery = [mastery("goroutines", { level: 0.9, confidence: 0.2 })];

    const steps = deriveNextSteps(
      goal(),
      learner,
      registryWith(["goroutines"]),
      TEST_NOW,
    );
    expect(steps[0]?.reason).toBe("unverified");
  });

  test("flags a concept that has gone cold", () => {
    const learner = testLearner();
    const old = new Date(TEST_NOW.getTime() - 40 * 86_400_000).toISOString();
    learner.mastery = [mastery("goroutines", { lastSeenAt: old })];

    const steps = deriveNextSteps(
      goal(),
      learner,
      registryWith(["goroutines"]),
      TEST_NOW,
    );
    expect(steps[0]?.reason).toBe("stale");
  });

  test("puts an untouched concept ahead of one merely gone cold", () => {
    const learner = testLearner();
    const old = new Date(TEST_NOW.getTime() - 40 * 86_400_000).toISOString();
    learner.mastery = [mastery("channels", { lastSeenAt: old })];

    const steps = deriveNextSteps(
      goal(),
      learner,
      registryWith(["goroutines", "channels"]),
      TEST_NOW,
    );

    expect(steps[0]?.conceptId).toBe("goroutines" as ConceptId);
  });
});
