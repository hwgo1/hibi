import { describe, expect, test } from "bun:test";

import type { ConceptId, ConceptRegistry } from "../src/concepts";
import { seedRegistry } from "../src/concepts";
import type { SessionId, UserId } from "../src/ids";
import { computeMastery } from "../src/policy/mastery";
import type { EvidenceEvent } from "../src/schemas/evidence";

const NOW = new Date("2026-01-01T00:00:00.000Z");
const GOROUTINES = "goroutines" as ConceptId;

function registryWithGoroutines(): ConceptRegistry {
  const base = seedRegistry(NOW);
  return {
    ...base,
    concepts: [
      ...base.concepts,
      {
        id: GOROUTINES,
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
    schemaVersion: 2,
    id: "ev" as EvidenceEvent["id"],
    at: NOW.toISOString(),
    userId: "local" as UserId,
    sessionId: "s1" as SessionId,
    turnIndex: 0,
    kind: "attempt_submitted",
    conceptId: GOROUTINES,
    provenance: "execution",
    confidence: 1,
    outcome: "pass",
    ...overrides,
  };
}

function entryFor(entries: ReturnType<typeof computeMastery>, id: ConceptId) {
  return entries.find((entry) => entry.conceptId === id);
}

describe("computeMastery", () => {
  test("credits the concept and rolls up to its ancestors", () => {
    const ids = computeMastery(registryWithGoroutines(), [event()], NOW).map(
      (e) => e.conceptId,
    );

    expect(ids).toContain(GOROUTINES);
    expect(ids).toContain("concurrency" as ConceptId);
    expect(ids).toContain("programming-fundamentals" as ConceptId);
  });

  test("a parent gains rolled-up evidence, not direct", () => {
    const parent = entryFor(
      computeMastery(registryWithGoroutines(), [event()], NOW),
      "concurrency" as ConceptId,
    );

    expect(parent?.directEvidenceCount).toBe(0);
    expect(parent?.rolledUpEvidenceCount).toBe(1);
  });

  test("confidence rises with more evidence", () => {
    const one = entryFor(
      computeMastery(registryWithGoroutines(), [event()], NOW),
      GOROUTINES,
    )!;
    const many = entryFor(
      computeMastery(
        registryWithGoroutines(),
        Array.from({ length: 6 }, () => event()),
        NOW,
      ),
      GOROUTINES,
    )!;

    expect(many.confidence).toBeGreaterThan(one.confidence);
  });

  test("a model-judged pass carries less confidence than an executed one", () => {
    const judged = entryFor(
      computeMastery(
        registryWithGoroutines(),
        [event({ provenance: "model_judged" })],
        NOW,
      ),
      GOROUTINES,
    )!;
    const executed = entryFor(
      computeMastery(
        registryWithGoroutines(),
        [event({ provenance: "execution" })],
        NOW,
      ),
      GOROUTINES,
    )!;

    expect(judged.confidence).toBeLessThan(executed.confidence);
  });

  test("a self-assessment counts, with self-declared weight", () => {
    const claimed = entryFor(
      computeMastery(
        registryWithGoroutines(),
        [event({ kind: "self_assessment", provenance: "self_declared" })],
        NOW,
      ),
      GOROUTINES,
    )!;
    const executed = entryFor(
      computeMastery(registryWithGoroutines(), [event()], NOW),
      GOROUTINES,
    )!;

    expect(claimed.confidence).toBeLessThan(executed.confidence);
  });

  test("solving at step 3 credits less than solving unaided", () => {
    const unaided = entryFor(
      computeMastery(registryWithGoroutines(), [event({ helpDepth: 1 })], NOW),
      GOROUTINES,
    )!;
    const shown = entryFor(
      computeMastery(registryWithGoroutines(), [event({ helpDepth: 3 })], NOW),
      GOROUTINES,
    )!;

    expect(shown.level).toBeLessThan(unaided.level);
  });

  test("system events produce no mastery", () => {
    const entries = computeMastery(
      registryWithGoroutines(),
      [event({ kind: "hint_given", provenance: "system", outcome: "n/a" })],
      NOW,
    );
    expect(entries).toHaveLength(0);
  });

  test("detected external code is never credited", () => {
    const entries = computeMastery(
      registryWithGoroutines(),
      [
        event({
          kind: "external_code_detected",
          provenance: "behavioral",
          confidence: 0.1,
        }),
      ],
      NOW,
    );
    expect(entryFor(entries, GOROUTINES)).toBeUndefined();
  });
});
