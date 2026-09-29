import { describe, expect, test } from "bun:test";

import { deriveSignals } from "../src/elicitation/signals";
import type { SessionId, UserId } from "../src/ids";
import type { EvidenceEvent } from "../src/schemas/evidence";

const NOW = new Date("2026-01-01T00:00:00.000Z");

function event(overrides: Partial<EvidenceEvent> = {}): EvidenceEvent {
  return {
    schemaVersion: 2,
    id: "ev" as EvidenceEvent["id"],
    at: NOW.toISOString(),
    userId: "local" as UserId,
    sessionId: "s1" as SessionId,
    turnIndex: 1,
    kind: "hint_given",
    conceptId: "concurrency" as EvidenceEvent["conceptId"],
    provenance: "system",
    confidence: 1,
    outcome: "n/a",
    ...overrides,
  };
}

function repeat(
  count: number,
  overrides: Partial<EvidenceEvent>,
): EvidenceEvent[] {
  return Array.from({ length: count }, () => event(overrides));
}

describe("deriveSignals", () => {
  test("infers nothing from too little evidence", () => {
    expect(deriveSignals(repeat(3, { helpDepth: 1 }), NOW)).toHaveLength(0);
  });

  test("notices a learner who unblocks at the first hint", () => {
    const signals = deriveSignals(repeat(10, { helpDepth: 1 }), NOW);
    expect(
      signals.find((signal) => signal.key === "hint-depth")?.value,
    ).toContain("first hint");
  });

  test("notices a learner who needs the problem named", () => {
    const signals = deriveSignals(repeat(10, { helpDepth: 2 }), NOW);
    expect(
      signals.find((signal) => signal.key === "hint-depth")?.value,
    ).toContain("problem named");
  });

  test("notices a learner who often asks for the answer", () => {
    const signals = deriveSignals(repeat(10, { helpDepth: 3 }), NOW);
    expect(signals.find((signal) => signal.key === "disclosure")).toBeDefined();
  });

  test("notices overestimation from calibration", () => {
    const signals = deriveSignals(
      repeat(10, { kind: "test_run", selfConfidence: 0.9, outcome: "fail" }),
      NOW,
    );

    expect(
      signals.find((signal) => signal.key === "self-assessment")?.value,
    ).toContain("over");
  });

  test("notices a learner who starts from code", () => {
    const signals = deriveSignals(
      [
        ...repeat(9, { kind: "exercise_proposed" }),
        ...repeat(1, { kind: "concept_explained" }),
      ],
      NOW,
    );

    expect(
      signals.find((signal) => signal.key === "entry-point")?.value,
    ).toContain("code");
  });

  test("confidence never reaches certainty", () => {
    for (const signal of deriveSignals(repeat(500, { helpDepth: 1 }), NOW)) {
      expect(signal.confidence).toBeLessThan(1);
    }
  });
});
