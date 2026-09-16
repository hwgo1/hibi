import type { ConceptRegistry } from "../concepts";
import type { Clock, Storage } from "../ports/storage";
import type { Workspace } from "../ports/workspace";
import type { LearnerModel } from "../schemas/learner";
import type { SessionState } from "../schemas/session";

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
  kind: string;
  conceptId: string;
  confidence: number;
  outcome?: "pass" | "fail" | "partial" | "n/a";
  helpDepth?: 1 | 2 | 3;
  filePath?: string;
  note?: string;
}
