import { describe, expect, test } from "bun:test";

import type { SessionId, UserId } from "../src/ids";
import type { EvidenceEvent } from "../src/schemas/evidence";
import { applyRetractions, buildRetraction } from "../src/schemas/evidence";

const ORIGIN = {
  userId: "local" as UserId,
  sessionId: "s1" as SessionId,
  turnIndex: 3,
  at: "2026-01-02T00:00:00.000Z",
};

function event(id: string, overrides: Partial<EvidenceEvent> = {}) {
  return {
    schemaVersion: 2,
    id: id as EvidenceEvent["id"],
    at: "2026-01-01T00:00:00.000Z",
    userId: "local" as UserId,
    sessionId: "s1" as SessionId,
    turnIndex: 1,
    kind: "attempt_submitted",
    conceptId: "linked-list" as EvidenceEvent["conceptId"],
    provenance: "execution",
    confidence: 1,
    outcome: "pass",
    ...overrides,
  } satisfies EvidenceEvent;
}

describe("applyRetractions", () => {
  test("hides exactly the events a retraction names", () => {
    const kept = event("b", {
      conceptId: "testing" as EvidenceEvent["conceptId"],
    });
    const visible = applyRetractions([
      event("a"),
      kept,
      buildRetraction([event("a")], ORIGIN),
    ]);

    expect(visible).toEqual([kept]);
  });

  test("never returns the retraction markers themselves", () => {
    const retraction = buildRetraction([event("a")], ORIGIN);
    expect(applyRetractions([retraction])).toHaveLength(0);
  });

  test("works when the retraction precedes the events it annuls", () => {
    expect(
      applyRetractions([buildRetraction([event("a")], ORIGIN), event("a")]),
    ).toHaveLength(0);
  });
});

describe("buildRetraction", () => {
  test("is a system event that carries no weight", () => {
    const retraction = buildRetraction([event("a"), event("b")], ORIGIN);

    expect(retraction).toMatchObject({
      kind: "evidence_retracted",
      provenance: "system",
      confidence: 0,
      retracts: ["a", "b"],
      turnIndex: 3,
    });
  });
});
