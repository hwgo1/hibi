import type { ConceptId, ConceptRegistry } from "../concepts";
import type { Goal, NextStep } from "../schemas/goal";
import type { LearnerModel, MasteryEntry } from "../schemas/learner";

/** How many steps to surface. More than this reads as a curriculum */
const MAX_STEPS = 3;

/** Mastery below which a concept still needs work */
const WEAK_THRESHOLD = 0.6;

/** Confidence below which an estimate is not trustworthy enough to act on */
const UNCERTAIN_THRESHOLD = 0.4;

/** Days after which a concept is worth revisiting */
const STALE_DAYS = 21;

const MS_PER_DAY = 86_400_000;

export function deriveNextSteps(
  goal: Goal,
  learner: LearnerModel,
  registry: ConceptRegistry,
  now: Date,
): NextStep[] {
  const skipped = new Set(goal.skipped);
  const byConcept = new Map(
    learner.mastery.map((entry) => [entry.conceptId, entry]),
  );
  const candidates: Array<NextStep & { rank: number }> = [];

  for (const concept of registry.concepts) {
    if (concept.mergedInto !== null) continue;
    if (concept.source === "seed") continue;
    if (skipped.has(concept.id)) continue;

    const scored = score(concept.id, byConcept.get(concept.id), now);
    if (scored === null) continue;

    candidates.push(scored);
  }

  return candidates
    .sort((a, b) => b.rank - a.rank)
    .slice(0, MAX_STEPS)
    .map(({ rank: _rank, ...step }) => step);
}

/**
 * Whether a concept is worth proposing, and how urgently.
 *
 * Returns null for anything already known well and recently, which is most of
 * a mature registry
 */
function score(
  conceptId: ConceptId,
  entry: MasteryEntry | undefined,
  now: Date,
): (NextStep & { rank: number }) | null {
  if (entry === undefined) {
    return { conceptId, level: 0, confidence: 0, reason: "untouched", rank: 1 };
  }

  if (entry.confidence < UNCERTAIN_THRESHOLD) {
    return { ...base(conceptId, entry), reason: "unverified", rank: 0.8 };
  }

  if (entry.level < WEAK_THRESHOLD) {
    return {
      ...base(conceptId, entry),
      reason: "weak",
      rank: 0.9 - entry.level,
    };
  }

  const days = (now.getTime() - Date.parse(entry.lastSeenAt)) / MS_PER_DAY;
  if (days >= STALE_DAYS) {
    return { ...base(conceptId, entry), reason: "stale", rank: 0.5 };
  }

  return null;
}

function base(conceptId: ConceptId, entry: MasteryEntry) {
  return { conceptId, level: entry.level, confidence: entry.confidence };
}
