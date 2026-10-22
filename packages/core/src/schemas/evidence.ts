import { z } from "zod";

import { ConceptIdSchema } from "../concepts";
import {
  EvidenceIdSchema,
  IsoDateTimeSchema,
  SessionIdSchema,
  UnitIntervalSchema,
  UserIdSchema,
  type EvidenceId,
  type SessionId,
  type UserId,
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
  "file_edited",
  "external_code_detected",
  "item_abandoned",
  "mastery_disputed",
  "evidence_retracted",
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
  /** The learner asked for the answer outright */
  forced: z.boolean().optional(),
  /** Repo-relative file the event concerns. Language is derived from it */
  filePath: z.string().min(1).optional(),
  /** The learner's own confidence before the attempt, for calibration */
  selfConfidence: UnitIntervalSchema.optional(),
  /** The learner's prediction of the outcome before running it */
  predicted: z.enum(["pass", "fail"]).optional(),
  note: z.string().optional(),
  /** On `evidence_retracted`: the events it annuls */
  retracts: z.array(EvidenceIdSchema).optional(),
});

export type EvidenceEvent = z.infer<typeof EvidenceEventSchema>;

/** What a caller decides about an event; identity and time are filled in by `buildEvidence` */
export type NewEvidence = Omit<
  EvidenceEvent,
  | "schemaVersion"
  | "id"
  | "at"
  | "userId"
  | "sessionId"
  | "turnIndex"
  | "confidence"
  | "outcome"
> &
  Partial<Pick<EvidenceEvent, "confidence" | "outcome">>;

export interface EvidenceOrigin {
  userId: UserId;
  sessionId: SessionId;
  turnIndex: number;
  at: string;
}

export function buildEvidence(
  evidence: NewEvidence,
  origin: EvidenceOrigin,
): EvidenceEvent {
  return {
    schemaVersion: EVIDENCE_EVENT_SCHEMA_VERSION,
    id: `ev_${crypto.randomUUID()}` as EvidenceId,
    ...origin,
    ...evidence,
    confidence: evidence.confidence ?? 1,
    outcome: evidence.outcome ?? "n/a",
  };
}

/** One event annulling others. The log stays append-only, so history can always be recomputed */
export function buildRetraction(
  targets: ReadonlyArray<Pick<EvidenceEvent, "id" | "conceptId">>,
  origin: EvidenceOrigin,
): EvidenceEvent {
  return buildEvidence(
    {
      kind: "evidence_retracted",
      conceptId: targets[0]!.conceptId,
      provenance: "system",
      confidence: 0,
      retracts: targets.map((target) => target.id),
    },
    origin,
  );
}

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

/** Drops retracted events and the retraction markers themselves */
export function applyRetractions(events: EvidenceEvent[]): EvidenceEvent[] {
  const retracted = new Set<string>();
  for (const event of events) {
    if (event.kind === "evidence_retracted") {
      for (const id of event.retracts ?? []) retracted.add(id);
    }
  }

  return events.filter(
    (event) => event.kind !== "evidence_retracted" && !retracted.has(event.id),
  );
}
