import type { ConceptId, ConceptRegistry } from "../concepts";
import { ancestors, indexConcepts } from "../concept-resolver";
import type { EvidenceEvent } from "../schemas/evidence";
import { evidenceWeight } from "../schemas/evidence";
import type { MasteryEntry } from "../schemas/learner";
import { MASTERY_FORMULA_VERSION } from "../schemas/learner";
import { creditMultiplier } from "./hint-ladder";

/** Weight applied per level of distance when rolling evidence up to parents */
const ROLLUP_DECAY = 0.4;

const CONFIDENCE_SATURATION = 8;

/** Evidence loses half its weight every this many days */
const HALF_LIFE_DAYS = 60;

const MS_PER_DAY = 86_400_000;

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
 * narrow topics accumulate signal at a level broad enough to be meaningful. Older evidence weighs
 * less: recent work sets the level, and confidence fades on concepts left untouched
 */
export function computeMastery(
  registry: ConceptRegistry,
  events: EvidenceEvent[],
  now: Date,
): MasteryEntry[] {
  const totals = new Map<string, Accumulator>();
  const index = indexConcepts(registry);

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
    const weight = evidenceWeight(event) * recency(event.at, now);
    if (weight === 0) continue;

    const score = scoreOf(event);
    if (score === null) continue;

    if (!index.has(event.conceptId)) continue;
    credit(event.conceptId, score, weight, event.at, true);

    for (const [distance, ancestor] of ancestors(
      index,
      event.conceptId,
    ).entries()) {
      credit(
        ancestor.id,
        score,
        weight * ROLLUP_DECAY ** (distance + 1),
        event.at,
        false,
      );
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

/** Concepts explained or demonstrated to the learner, whether or not anything was scored */
export function seenConcepts(events: EvidenceEvent[]): ConceptId[] {
  const seen = new Set<ConceptId>();
  for (const event of events) {
    if (
      event.kind === "concept_explained" ||
      event.kind === "code_demonstrated"
    ) {
      seen.add(event.conceptId);
    }
  }
  return [...seen];
}

function recency(at: string, now: Date): number {
  const ageDays = Math.max(0, now.getTime() - Date.parse(at)) / MS_PER_DAY;
  return 0.5 ** (ageDays / HALF_LIFE_DAYS);
}

/**
 * Maps an event to a 0..1 score, discounted by how much help was needed.
 * Events that say nothing about ability return null and are skipped
 */
function scoreOf(event: EvidenceEvent): number | null {
  if (
    event.kind === "concept_explained" ||
    event.kind === "code_demonstrated" ||
    event.kind === "exercise_proposed" ||
    event.kind === "external_code_detected"
  ) {
    return null;
  }

  const multiplier =
    event.helpDepth === undefined
      ? 1
      : creditMultiplier(event.helpDepth, event.forced === true);

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
