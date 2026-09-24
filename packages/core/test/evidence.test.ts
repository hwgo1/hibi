import { describe, expect, test } from "bun:test";

import { evidenceWeight, parseEvidenceLine } from "../src/schemas/evidence";

const base = {
  schemaVersion: 2,
  id: "ev1",
  at: "2026-01-01T00:00:00.000Z",
  userId: "local",
  sessionId: "s1",
  turnIndex: 1,
  conceptId: "linked-list",
  confidence: 1,
  outcome: "pass",
};

describe("parseEvidenceLine", () => {
  test("accepts a well-formed event", () => {
    const event = parseEvidenceLine({
      ...base,
      kind: "test_run",
      provenance: "execution",
      selfConfidence: 0.7,
    });

    expect(event?.provenance).toBe("execution");
    expect(event?.selfConfidence).toBe(0.7);
  });

  test("rejects an event with no provenance", () => {
    expect(
      parseEvidenceLine({ ...base, kind: "attempt_submitted" }),
    ).toBeNull();
  });

  test("rejects an older schema version", () => {
    expect(
      parseEvidenceLine({
        ...base,
        schemaVersion: 1,
        kind: "attempt_submitted",
      }),
    ).toBeNull();
  });

  test("rejects an unparsable line", () => {
    expect(parseEvidenceLine({ broken: true })).toBeNull();
  });
});

describe("evidenceWeight", () => {
  test("system events carry no weight", () => {
    const event = parseEvidenceLine({
      ...base,
      kind: "hint_given",
      provenance: "system",
    })!;
    expect(evidenceWeight(event)).toBe(0);
  });

  test("scales source trust by the event's own confidence", () => {
    const event = parseEvidenceLine({
      ...base,
      kind: "test_run",
      provenance: "execution",
      confidence: 0.5,
    })!;
    expect(evidenceWeight(event)).toBe(0.5);
  });

  test("ranks execution above model judgement above self-declaration", () => {
    const weigh = (provenance: string) =>
      evidenceWeight(
        parseEvidenceLine({ ...base, kind: "attempt_submitted", provenance })!,
      );

    expect(weigh("execution")).toBeGreaterThan(weigh("model_judged"));
    expect(weigh("model_judged")).toBeGreaterThan(weigh("self_declared"));
  });
});
