import type { Provenance } from "../schemas/evidence";
import type { QuizResponse } from "../schemas/quiz";

export interface ScoredResponse {
  outcome: "pass" | "fail" | "n/a";
  provenance: Provenance;
  confidence: number;
}

/** Turns a quiz answer into evidence */
export function scoreResponse(
  response: QuizResponse,
  optionCount: number,
): ScoredResponse {
  if (response === "unknown") {
    return { outcome: "n/a", provenance: "self_declared", confidence: 0.6 };
  }

  if (response === "incorrect") {
    return { outcome: "fail", provenance: "graded_choice", confidence: 1 };
  }

  const guessRate = 1 / Math.max(optionCount, 2);
  return {
    outcome: "pass",
    provenance: "graded_choice",
    confidence: 1 - guessRate,
  };
}

export function disputeWeight(priorDisputes: number): number {
  return 1 / (1 + priorDisputes);
}
