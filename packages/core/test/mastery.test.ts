import { describe, expect, test } from "bun:test";

import type { ConceptId, ConceptRegistry } from "../src/concepts";
import { seedRegistry } from "../src/concepts";
import { computeMastery } from "../src/policy/mastery";
import type { EvidenceEvent } from "../src/schemas/evidence";
import type { SessionId, UserId } from "../src/ids";

const NOW = new Date("2026-01-01T00:00:00.000Z");

function registryWithGoroutines(): ConceptRegistry {
  const base = seedRegistry(NOW);
  return {
    ...base,
    concepts: [
      ...base.concepts,
      {
        id: "goroutines" as ConceptId,
        canonicalName: "goroutines",
        aliases: [],
        parentId: "concurrency" as ConceptId,
        source: "proposed",
        createdAt: NOW.toISOString(),
        mergedInto: null,
      },
    ],
  };
}

function event(overrides: Partial<EvidenceEvent> = {}): EvidenceEvent {
  return {
    schemaVersion: 1,
    id: "ev" as EvidenceEvent["id"],
    at: NOW.toISOString(),
    userId: "local" as UserId,
    sessionId: "s1" as SessionId,
    turnIndex: 0,
    kind: "attempt_submitted",
    conceptId: "goroutines" as ConceptId,
    confidence: 1,
    outcome: "pass",
    ...overrides,
  };
}

describe("computeMastery", () => {
  test("credits the concept and rolls up to its ancestors", () => {
    const entries = computeMastery(registryWithGoroutines(), [event()], NOW);
    const ids = entries.map((e) => e.conceptId);

    expect(ids).toContain("goroutines" as ConceptId);
    expect(ids).toContain("concurrency" as ConceptId);
    expect(ids).toContain("programming-fundamentals" as ConceptId);
  });

  test("a parent gains rolled-up evidence, not direct", () => {
    const entries = computeMastery(registryWithGoroutines(), [event()], NOW);
    const parent = entries.find(
      (e) => e.conceptId === ("concurrency" as ConceptId),
    );

    expect(parent?.directEvidenceCount).toBe(0);
    expect(parent?.rolledUpEvidenceCount).toBe(1);
  });

  test("confidence rises with more evidence", () => {
    const one = computeMastery(registryWithGoroutines(), [event()], NOW);
    const many = computeMastery(
      registryWithGoroutines(),
      Array.from({ length: 6 }, () => event()),
      NOW,
    );

    const a = one.find((e) => e.conceptId === ("goroutines" as ConceptId))!;
    const b = many.find((e) => e.conceptId === ("goroutines" as ConceptId))!;
    expect(b.confidence).toBeGreaterThan(a.confidence);
  });

  test("solving at step 3 credits less than solving unaided", () => {
    const unaided = computeMastery(
      registryWithGoroutines(),
      [event({ helpDepth: 1 })],
      NOW,
    );
    const shown = computeMastery(
      registryWithGoroutines(),
      [event({ helpDepth: 3 })],
      NOW,
    );

    const a = unaided.find((e) => e.conceptId === ("goroutines" as ConceptId))!;
    const b = shown.find((e) => e.conceptId === ("goroutines" as ConceptId))!;
    expect(b.level).toBeLessThan(a.level);
  });

  test("low-confidence evidence barely moves confidence", () => {
    const entries = computeMastery(
      registryWithGoroutines(),
      [event({ kind: "external_code_detected", confidence: 0.1 })],
      NOW,
    );
    expect(
      entries.find((e) => e.conceptId === ("goroutines" as ConceptId)),
    ).toBeUndefined();
  });

  test("explanations alone produce no mastery", () => {
    const entries = computeMastery(
      registryWithGoroutines(),
      [event({ kind: "concept_explained", outcome: "n/a" })],
      NOW,
    );
    expect(entries).toHaveLength(0);
  });
});
