import { describe, expect, test } from "bun:test";

import type { SessionId, UserId } from "../src/ids";
import type { EvidenceEvent } from "../src/schemas/evidence";
import { applyRetractions, retractionNote } from "../src/schemas/evidence";

function event(overrides: Partial<EvidenceEvent> = {}): EvidenceEvent {
  return {
    schemaVersion: 2,
    id: "ev" as EvidenceEvent["id"],
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
  };
}

function retraction(turnIndex: number, sessionId = "s1"): EvidenceEvent {
  return event({
    sessionId: sessionId as SessionId,
    turnIndex,
    kind: "turn_retracted",
    provenance: "system",
    confidence: 0,
    outcome: "n/a",
    note: retractionNote(turnIndex),
  });
}

describe("applyRetractions", () => {
  test("hides events from a retracted turn", () => {
    expect(
      applyRetractions([event({ turnIndex: 1 }), retraction(1)]),
    ).toHaveLength(0);
  });

  test("leaves other turns untouched", () => {
    const visible = applyRetractions([
      event({ turnIndex: 1 }),
      event({ turnIndex: 2 }),
      retraction(1),
    ]);

    expect(visible).toHaveLength(1);
    expect(visible[0]!.turnIndex).toBe(2);
  });

  test("hides every event of the retracted turn, not just one", () => {
    const visible = applyRetractions([
      event({ turnIndex: 1, id: "a" as EvidenceEvent["id"] }),
      event({
        turnIndex: 1,
        id: "b" as EvidenceEvent["id"],
        kind: "hint_given",
      }),
      retraction(1),
    ]);

    expect(visible).toHaveLength(0);
  });

  test("scopes a retraction to its own session", () => {
    const visible = applyRetractions([
      event({ turnIndex: 1, sessionId: "s2" as SessionId }),
      retraction(1, "s1"),
    ]);

    expect(visible).toHaveLength(1);
  });

  test("never returns the retraction markers themselves", () => {
    expect(applyRetractions([retraction(1), retraction(2)])).toHaveLength(0);
  });

  test("works when the retraction precedes the events it annuls", () => {
    expect(
      applyRetractions([retraction(1), event({ turnIndex: 1 })]),
    ).toHaveLength(0);
  });
});
