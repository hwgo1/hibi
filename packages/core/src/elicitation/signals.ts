import type { EvidenceEvent } from "../schemas/evidence";
import type { InferredSignal } from "../schemas/learner";
import { computeCalibration } from "./calibration";

/** Minimum events before a pattern is reported as a signal */
const MIN_SAMPLE = 8;

const MAX_CONFIDENCE = 0.8;
const BIAS_THRESHOLD = 0.2;

/** Derives what the tutor believes it has observed about how this learner works */
export function deriveSignals(
  events: EvidenceEvent[],
  now: Date,
): InferredSignal[] {
  const signals: InferredSignal[] = [];
  const at = now.toISOString();

  const calibration = computeCalibration(events);
  if (calibration !== null && Math.abs(calibration.bias) >= BIAS_THRESHOLD) {
    signals.push({
      key: "self-assessment",
      value:
        calibration.bias > 0
          ? "tends to overestimate"
          : "tends to underestimate",
      confidence: confidenceFor(calibration.sampleSize),
      evidenceCount: calibration.sampleSize,
      updatedAt: at,
    });
  }

  const hints = events.filter((event) => event.kind === "hint_given");

  if (hints.length >= MIN_SAMPLE) {
    const deep =
      hints.filter((event) => (event.helpDepth ?? 1) >= 2).length /
      hints.length;

    if (deep <= 0.3) {
      signals.push({
        key: "hint-depth",
        value: "usually unblocks at the first hint",
        confidence: confidenceFor(hints.length),
        evidenceCount: hints.length,
        updatedAt: at,
      });
    } else if (deep >= 0.7) {
      signals.push({
        key: "hint-depth",
        value: "usually needs the problem named before moving",
        confidence: confidenceFor(hints.length),
        evidenceCount: hints.length,
        updatedAt: at,
      });
    }

    const forced =
      hints.filter((event) => event.helpDepth === 3).length / hints.length;
    if (forced >= 0.5) {
      signals.push({
        key: "disclosure",
        value: "often asks for the answer outright",
        confidence: confidenceFor(hints.length),
        evidenceCount: hints.length,
        updatedAt: at,
      });
    }
  }

  const explained = events.filter(
    (event) => event.kind === "concept_explained",
  ).length;
  const exercised = events.filter(
    (event) => event.kind === "exercise_proposed",
  ).length;
  const total = explained + exercised;

  if (total >= MIN_SAMPLE) {
    const theoryShare = explained / total;

    if (theoryShare >= 0.7) {
      signals.push({
        key: "entry-point",
        value: "asks for the concept before the exercise",
        confidence: confidenceFor(total),
        evidenceCount: total,
        updatedAt: at,
      });
    } else if (theoryShare <= 0.3) {
      signals.push({
        key: "entry-point",
        value: "starts from code rather than explanation",
        confidence: confidenceFor(total),
        evidenceCount: total,
        updatedAt: at,
      });
    }
  }

  return signals;
}

function confidenceFor(sampleSize: number): number {
  return Math.min(MAX_CONFIDENCE, sampleSize / (sampleSize + 10));
}
