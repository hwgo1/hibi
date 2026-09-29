import { describe, expect, test } from "bun:test";

import {
  CALIBRATION_MIN_SAMPLE,
  computeCalibration,
  predictionWasCorrect,
} from "../src/elicitation/calibration";
import type { SessionId, UserId } from "../src/ids";
import type { EvidenceEvent } from "../src/schemas/evidence";

function event(overrides: Partial<EvidenceEvent> = {}): EvidenceEvent {
  return {
    schemaVersion: 2,
    id: "ev" as EvidenceEvent["id"],
    at: "2026-01-01T00:00:00.000Z",
    userId: "local" as UserId,
    sessionId: "s1" as SessionId,
    turnIndex: 1,
    kind: "test_run",
    conceptId: "concurrency" as EvidenceEvent["conceptId"],
    provenance: "execution",
    confidence: 1,
    outcome: "pass",
    ...overrides,
  };
}

function repeat(
  count: number,
  overrides: Partial<EvidenceEvent>,
): EvidenceEvent[] {
  return Array.from({ length: count }, () => event(overrides));
}

describe("computeCalibration", () => {
  test("returns null below the minimum sample", () => {
    expect(computeCalibration(repeat(2, { selfConfidence: 0.9 }))).toBeNull();
  });

  test("ignores events with no stated confidence", () => {
    expect(computeCalibration(repeat(10, {}))).toBeNull();
  });

  test("reports overconfidence as positive bias", () => {
    const calibration = computeCalibration(
      repeat(CALIBRATION_MIN_SAMPLE, { selfConfidence: 0.9, outcome: "fail" }),
    )!;

    expect(calibration.bias).toBeGreaterThan(0);
    expect(calibration.error).toBeCloseTo(0.9, 5);
  });

  test("reports underconfidence as negative bias", () => {
    const calibration = computeCalibration(
      repeat(CALIBRATION_MIN_SAMPLE, { selfConfidence: 0.2, outcome: "pass" }),
    )!;

    expect(calibration.bias).toBeLessThan(0);
  });

  test("reports a well-calibrated learner as near zero", () => {
    const calibration = computeCalibration([
      ...repeat(4, { selfConfidence: 0.9, outcome: "pass" }),
      ...repeat(4, { selfConfidence: 0.1, outcome: "fail" }),
    ])!;

    expect(Math.abs(calibration.bias)).toBeLessThan(0.15);
  });
});

describe("predictionWasCorrect", () => {
  test("is true when the prediction matched", () => {
    expect(
      predictionWasCorrect(event({ predicted: "pass", outcome: "pass" })),
    ).toBe(true);
  });

  test("is false when it did not", () => {
    expect(
      predictionWasCorrect(event({ predicted: "pass", outcome: "fail" })),
    ).toBe(false);
  });

  test("is null without a prediction", () => {
    expect(predictionWasCorrect(event())).toBeNull();
  });
});
