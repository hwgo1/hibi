import type { ConceptId, ConceptRegistry } from "../concepts";
import type { Clock, Storage } from "../ports/storage";
import type { Workspace } from "../ports/workspace";
import type { EvidenceKind, Provenance } from "../schemas/evidence";
import type { LearnerModel } from "../schemas/learner";
import type { HintStep, SessionState } from "../schemas/session";

/**
 * Mutable state a turn operates on. Tools read and replace these fields; the daemon persists
 * whatever they hold once the turn ends, so a failed turn leaves nothing half-written on disk.
 */
export interface ToolContext {
  session: SessionState;
  registry: ConceptRegistry;
  learner: LearnerModel;
  workspace: Workspace;
  storage: Storage;
  clock: Clock;
  /** Collected during the turn and appended after it succeeds. */
  pendingEvidence: PendingEvidence[];
}

export interface PendingEvidence {
  kind: EvidenceKind;
  conceptId: ConceptId;
  provenance: Provenance;
  confidence?: number;
  outcome?: "pass" | "fail" | "partial" | "n/a";
  helpDepth?: HintStep;
  selfConfidence?: number;
  predicted?: "pass" | "fail";
  filePath?: string;
  note?: string;
}
