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
  "code_demonstrated",
  "exercise_proposed",
  "attempt_submitted",
  "quiz_answered",
  "self_assessment",
  "hint_given",
  "audit_finding",
  "test_run",
  "external_code_detected",
  "intent_abandoned",
] as const;

export const EvidenceKindSchema = z.enum(EVIDENCE_KINDS);
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

/**
 * Where an event's claim about the learner comes from. Sources differ in kind,
 * not just degree: a passing test is a verified fact, a correct multiple-choice
 * answer is an observation, the model deciding the learner understood is an
 * opinion. `system` marks events that record what hibi did rather than what
 * the learner showed
 */
export const PROVENANCES = [
  "execution",
  "graded_choice",
  "behavioral",
  "model_judged",
  "self_declared",
  "system",
] as const;

export const ProvenanceSchema = z.enum(PROVENANCES);
export type Provenance = z.infer<typeof ProvenanceSchema>;

/** Weight each provenance carries in mastery */
export const PROVENANCE_WEIGHTS: Record<Provenance, number> = {
  execution: 1,
  graded_choice: 0.8,
  behavioral: 0.5,
  model_judged: 0.35,
  self_declared: 0.15,
  system: 0,
};

export const EVIDENCE_EVENT_SCHEMA_VERSION = 2;

const EventFields = {
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
  /** Hint depth reached, when applicable. Higher depth credits less mastery */
  helpDepth: HintStepSchema.optional(),
  /** Repo-relative file the event concerns */
  filePath: z.string().min(1).optional(),
  note: z.string().optional(),
};

export const EvidenceEventSchema = z.object({
  schemaVersion: z.literal(EVIDENCE_EVENT_SCHEMA_VERSION),
  ...EventFields,
  provenance: ProvenanceSchema,
  /** The learner's own confidence before the attempt, for calibration. */
  selfConfidence: UnitIntervalSchema.optional(),
  /** The learner's prediction of the outcome before running it. */
  predicted: z.enum(["pass", "fail"]).optional(),
});

export type EvidenceEvent = z.infer<typeof EvidenceEventSchema>;

/**
 * Parses one log line. Returns null for a line the schema rejects, so one bad
 * line never makes the history unreadable.
 */
export function parseEvidenceLine(raw: unknown): EvidenceEvent | null {
  const parsed = EvidenceEventSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function evidenceWeight(event: EvidenceEvent): number {
  return PROVENANCE_WEIGHTS[event.provenance] * event.confidence;
}
