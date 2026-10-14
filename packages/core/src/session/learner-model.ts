import type { ConceptRegistry } from "../concepts";
import { deriveSignals } from "../elicitation/signals";
import type { UserId } from "../ids";
import type { Storage } from "../ports/storage";
import { computeMastery, seenConcepts } from "../policy/mastery";
import {
  DEFAULT_TEACHING_PREFERENCES,
  type LearnerModel,
} from "../schemas/learner";

export async function loadLearner(
  storage: Storage,
  userId: UserId,
  now: Date,
): Promise<LearnerModel> {
  const existing = await storage.loadLearnerModel(userId);
  if (existing !== null) return existing;

  const at = now.toISOString();
  return {
    schemaVersion: 1,
    userId,
    createdAt: at,
    updatedAt: at,
    preferences: { ...DEFAULT_TEACHING_PREFERENCES },
    goal: null,
    mastery: [],
    seen: [],
    recurringErrors: [],
    inferredSignals: [],
  };
}

/** The one place everything derived from the log is recomputed: mastery, seen concepts and signals */
export async function refreshLearner(
  storage: Storage,
  learner: LearnerModel,
  registry: ConceptRegistry,
  now: Date,
): Promise<void> {
  const events = await storage.queryEvidence({ userId: learner.userId });
  learner.mastery = computeMastery(registry, events, now);
  learner.seen = seenConcepts(events);
  learner.inferredSignals = deriveSignals(events, now);
  learner.updatedAt = now.toISOString();
}
