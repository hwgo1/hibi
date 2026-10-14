import type { ConceptRegistry } from "../concepts";
import type { Clock, Storage } from "../ports/storage";
import type { Workspace } from "../ports/workspace";
import type { NewEvidence } from "../schemas/evidence";
import type { LearnerModel } from "../schemas/learner";
import type { SessionState } from "../schemas/session";

/**
 * Mutable state a turn operates on. Tools read and replace these fields; the turn
 * commits whatever they hold once it succeeds, so a failed turn leaves nothing behind.
 */
export interface ToolContext {
  session: SessionState;
  registry: ConceptRegistry;
  learner: LearnerModel;
  workspace: Workspace;
  storage: Storage;
  clock: Clock;
  /** Collected during the turn and appended in one write after it succeeds. */
  pendingEvidence: PendingEvidence[];
}

export type PendingEvidence = NewEvidence;
