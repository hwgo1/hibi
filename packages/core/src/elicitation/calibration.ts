import type { EvidenceEvent } from "../schemas/evidence";

/**
 * How well the learner's stated confidence matched their actual results.
 *
 * Positive bias means overconfident, negative means underconfident, near zero
 * means well calibrated
 */
export interface Calibration {
  /** Events carrying both a stated confidence and a known outcome */
  sampleSize: number;
  /** Mean of stated confidence minus actual success, in -1..1 */
  bias: number;
  /** Mean absolute gap, in 0..1. Lower is better calibrated */
  error: number;
}

/** Minimum sample before calibration is worth reporting */
export const CALIBRATION_MIN_SAMPLE = 5;

export function computeCalibration(
  events: EvidenceEvent[],
): Calibration | null {
  const scored = events.filter(
    (event) =>
      event.selfConfidence !== undefined &&
      (event.outcome === "pass" || event.outcome === "fail"),
  );

  if (scored.length < CALIBRATION_MIN_SAMPLE) return null;

  let biasSum = 0;
  let errorSum = 0;

  for (const event of scored) {
    const actual = event.outcome === "pass" ? 1 : 0;
    const gap = (event.selfConfidence ?? 0) - actual;
    biasSum += gap;
    errorSum += Math.abs(gap);
  }

  return {
    sampleSize: scored.length,
    bias: biasSum / scored.length,
    error: errorSum / scored.length,
  };
}

export function predictionWasCorrect(event: EvidenceEvent): boolean | null {
  if (event.predicted === undefined) return null;
  if (event.outcome !== "pass" && event.outcome !== "fail") return null;
  return event.predicted === event.outcome;
}
