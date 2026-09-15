import { z } from "zod";
import { ConceptIdSchema } from "../concepts";
import {
  EvidenceIdSchema,
  IsoDateTimeSchema,
  SessionIdSchema,
  UnitIntervalSchema,
  UserIdSchema,
} from "../ids";
import { HintStepSchema } from "./session";

export const EVIDENCE_KINDS = [
  "concept_explained",
  "exercise_proposed",
  "attempt_submitted",
  "hint_given",
  "audit_finding",
  "test_run",
  "external_code_detected",
  "intent_abandoned",
] as const;

export const EvidenceKindSchema = z.enum(EVIDENCE_KINDS);
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

export const EVIDENCE_EVENT_SCHEMA_VERSION = 1;

/**
 * One immutable fact, appended as a JSONL line. Mastery is a function over this log,
 * so the log is never rewritten: changing how mastery is computed means recomputing
 */
export const EvidenceEventSchema = z.object({
  schemaVersion: z.literal(EVIDENCE_EVENT_SCHEMA_VERSION),
  id: EvidenceIdSchema,
  at: IsoDateTimeSchema,
  userId: UserIdSchema,
  sessionId: SessionIdSchema,
  turnIndex: z.number().int().nonnegative(),
  kind: EvidenceKindSchema,
  conceptId: ConceptIdSchema,
  /** How much this event says about the learner */
  confidence: UnitIntervalSchema,
  outcome: z.enum(["pass", "fail", "partial", "n/a"]).default("n/a"),
  /** Hint depth reached, when applicable. Higher credits less mastery */
  helpDepth: HintStepSchema.optional(),
  filePath: z.string().min(1).optional(),
  note: z.string().optional(),
});

export type EvidenceEvent = z.infer<typeof EvidenceEventSchema>;
