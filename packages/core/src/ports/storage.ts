import type { ConceptId, ConceptRegistry } from "../concepts";
import type { EvidenceEvent } from "../schemas/evidence";
import type { LearnerModel } from "../schemas/learner";
import type { RepoModel } from "../schemas/repo";
import type { SessionState } from "../schemas/session";
import type { SessionId, UserId } from "../ids";

export interface EvidenceQuery {
  userId: UserId;
  conceptId?: ConceptId;
  since?: string;
  limit?: number;
}

export interface Storage {
  loadLearnerModel(userId: UserId): Promise<LearnerModel | null>;
  saveLearnerModel(model: LearnerModel): Promise<void>;

  loadSession(sessionId: SessionId): Promise<SessionState | null>;
  saveSession(state: SessionState): Promise<void>;

  loadRepoModel(repoRoot: string): Promise<RepoModel | null>;
  saveRepoModel(model: RepoModel): Promise<void>;

  loadConceptRegistry(userId: UserId): Promise<ConceptRegistry | null>;
  saveConceptRegistry(userId: UserId, registry: ConceptRegistry): Promise<void>;

  /** Append-only. Never updates or deletes an existing event */
  appendEvidence(event: EvidenceEvent): Promise<void>;
  queryEvidence(query: EvidenceQuery): Promise<EvidenceEvent[]>;
}

/** Injected so time-dependent logic stays deterministic under test */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
