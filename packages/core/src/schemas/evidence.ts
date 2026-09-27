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
  "turn_retracted",
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

export const PROVENANCE_WEIGHTS: Record<Provenance, number> = {
  execution: 1,
  graded_choice: 0.8,
  behavioral: 0.5,
  model_judged: 0.35,
  self_declared: 0.15,
  system: 0,
};

export const EVIDENCE_EVENT_SCHEMA_VERSION = 2;

export const EvidenceEventSchema = z.object({
  schemaVersion: z.literal(EVIDENCE_EVENT_SCHEMA_VERSION),
  id: EvidenceIdSchema,
  at: IsoDateTimeSchema,
  userId: UserIdSchema,
  sessionId: SessionIdSchema,
  turnIndex: z.number().int().nonnegative(),
  kind: EvidenceKindSchema,
  conceptId: ConceptIdSchema,
  provenance: ProvenanceSchema,
  confidence: UnitIntervalSchema,
  outcome: z.enum(["pass", "fail", "partial", "n/a"]).default("n/a"),
  /** Hint depth reached, when applicable. Higher depth credits less mastery */
  helpDepth: HintStepSchema.optional(),
  /** Repo-relative file the event concerns. Language is derived from it */
  filePath: z.string().min(1).optional(),
  /** The learner's own confidence before the attempt, for calibration */
  selfConfidence: UnitIntervalSchema.optional(),
  /** The learner's prediction of the outcome before running it */
  predicted: z.enum(["pass", "fail"]).optional(),
  note: z.string().optional(),
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

const RETRACTION_PREFIX = "retract:";

/** Note marking a `turn_retracted` event as annulling the given turn. */
export function retractionNote(turnIndex: number): string {
  return `${RETRACTION_PREFIX}${turnIndex}`;
}

/**
 * Drops events belonging to retracted turns.
 *
 * A retraction is an appended event, so the log stays append-only and mastery
 * can still be recomputed over its full history
 */
export function applyRetractions(events: EvidenceEvent[]): EvidenceEvent[] {
  const retracted = new Set<string>();

  for (const event of events) {
    if (event.kind !== "turn_retracted") continue;
    if (event.note?.startsWith(RETRACTION_PREFIX) !== true) continue;
    retracted.add(
      `${event.sessionId}:${event.note.slice(RETRACTION_PREFIX.length)}`,
    );
  }

  return events.filter(
    (event) =>
      event.kind !== "turn_retracted" &&
      !retracted.has(`${event.sessionId}:${event.turnIndex}`),
  );
}
