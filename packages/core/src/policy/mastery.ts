import type { ConceptId, ConceptRegistry } from "../concepts";
import { ancestors, canonical } from "../concept-resolver";
import type { EvidenceEvent } from "../schemas/evidence";
import type { MasteryEntry } from "../schemas/learner";
import { MASTERY_FORMULA_VERSION } from "../schemas/learner";
import { creditMultiplier } from "./hint-ladder";

/** Weight applied per level of distance when rolling evidence up to parents */
const ROLLUP_DECAY = 0.4;

const CONFIDENCE_SATURATION = 8;

interface Accumulator {
  weightedScore: number;
  weight: number;
  direct: number;
  rolledUp: number;
  lastSeenAt: string;
}

/**
 * Recomputes mastery from the evidence log. A change to the formula means recomputing history
 * rather than migrating it.
 *
 * Each event credits its own concept at full weight and every ancestor at a decaying weight, so
 * narrow topics accumulate signal at a level broad enough to be meaningful
 */
export function computeMastery(
  registry: ConceptRegistry,
  events: EvidenceEvent[],
  now: Date,
): MasteryEntry[] {
  const totals = new Map<string, Accumulator>();

  const credit = (
    conceptId: ConceptId,
    score: number,
    weight: number,
    at: string,
    isDirect: boolean,
  ): void => {
    const current = totals.get(conceptId) ?? {
      weightedScore: 0,
      weight: 0,
      direct: 0,
      rolledUp: 0,
      lastSeenAt: at,
    };
    current.weightedScore += score * weight;
    current.weight += weight;
    if (isDirect) current.direct += 1;
    else current.rolledUp += 1;
    if (at > current.lastSeenAt) current.lastSeenAt = at;
    totals.set(conceptId, current);
  };

  for (const event of events) {
    const outcomeScore = scoreOf(event);
    if (outcomeScore === null) continue;

    const target = canonical(registry, event.conceptId);
    if (target === null) continue;

    credit(target.id, outcomeScore, event.confidence, event.at, true);

    const chain = ancestors(registry, target.id);
    for (const [index, ancestor] of chain.entries()) {
      const decayed = event.confidence * ROLLUP_DECAY ** (index + 1);
      credit(ancestor.id, outcomeScore, decayed, event.at, false);
    }
  }

  const computedAt = now.toISOString();
  const entries: MasteryEntry[] = [];

  for (const [conceptId, total] of totals) {
    if (total.weight === 0) continue;
    entries.push({
      conceptId: conceptId as ConceptId,
      level: clamp(total.weightedScore / total.weight),
      confidence: clamp(total.weight / CONFIDENCE_SATURATION),
      directEvidenceCount: total.direct,
      rolledUpEvidenceCount: total.rolledUp,
      computedAt,
      formulaVersion: MASTERY_FORMULA_VERSION,
      lastSeenAt: total.lastSeenAt,
    });
  }

  return entries;
}

/**
 * Maps an event to a 0..1 score, discounted by how much help was needed.
 * Events that say nothing about ability return null and are skipped
 */
function scoreOf(event: EvidenceEvent): number | null {
  if (event.kind === "concept_explained" || event.kind === "exercise_proposed")
    return null;
  if (event.kind === "external_code_detected") return null;

  const depth = event.helpDepth;
  const multiplier = depth === undefined ? 1 : creditMultiplier(depth, false);

  switch (event.outcome) {
    case "pass":
      return multiplier;
    case "partial":
      return multiplier * 0.5;
    case "fail":
      return 0;
    default:
      return null;
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
