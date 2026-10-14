import { z } from "zod";

import { ConceptIdSchema } from "../concepts";
import {
  FindingIdSchema,
  IsoDateTimeSchema,
  ItemIdSchema,
  SessionIdSchema,
  UnitIntervalSchema,
  UserIdSchema,
} from "../ids";
import { CheckSchema } from "./check";
import { OpenElicitationSchema, type OpenElicitation } from "./elicitation";
import { OpenQuizSchema, type OpenQuiz } from "./quiz";

/** Locates a snippet without relying on line numbers, which drafts as soon as the user edits above the anchor.
 * `contentHash` detects a stale anchor; `snippet` allows re-locating it
 */
export const CodeAnchorSchema = z.object({
  filePath: z.string().min(1),
  snippet: z.string().min(1),
  contentHash: z.string().min(1),
  approxLine: z.number().int().positive().optional(),
});

export type CodeAnchor = z.infer<typeof CodeAnchorSchema>;

export const FindingOriginSchema = z.enum([
  "audit",
  "watcher",
  "test-run",
  "user-reported",
]);
export type FindingOrigin = z.infer<typeof FindingOriginSchema>;

export const FindingSchema = z.object({
  id: FindingIdSchema,
  conceptId: ConceptIdSchema,
  anchor: CodeAnchorSchema,
  summary: z.string().min(1),
  origin: FindingOriginSchema,
  pedagogicalValue: UnitIntervalSchema,
  isRecurring: z.boolean().default(false),
  status: z.enum(["triaged", "deferred", "resolved"]).default("deferred"),
});

export type Finding = z.infer<typeof FindingSchema>;

export const STALE_ITEM_THRESHOLD_MS = 72 * 60 * 60 * 1000;

export const HINT_STEPS = [1, 2, 3] as const;
export const HintStepSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export type HintStep = z.infer<typeof HintStepSchema>;

/** Created by the first hint; attempts live on the item so none are lost before it */
export const LadderSchema = z.object({
  entryStep: HintStepSchema,
  step: HintStepSchema,
  hintsGiven: z.number().int().nonnegative().default(0),
  attemptsAtLastHint: z.number().int().nonnegative().default(0),
  lastHintAt: IsoDateTimeSchema.optional(),
  /** The learner asked for the answer outright */
  forced: z.boolean().default(false),
});

export type Ladder = z.infer<typeof LadderSchema>;

export const PredictionSchema = z.object({
  predicted: z.enum(["pass", "fail"]),
  selfConfidence: UnitIntervalSchema.optional(),
  madeAt: IsoDateTimeSchema,
});

export type Prediction = z.infer<typeof PredictionSchema>;

export const WorkItemSchema = z.object({
  id: ItemIdSchema,
  kind: z.literal("exercise"),
  conceptId: ConceptIdSchema,
  statement: z.string().min(1),
  targetFile: z.string().min(1).optional(),
  /** Absent when no test can decide the item */
  check: CheckSchema.optional(),
  attempts: z.number().int().nonnegative().default(0),
  ladder: LadderSchema.optional(),
  /** Consumed by the next verify */
  prediction: PredictionSchema.optional(),
  createdAt: IsoDateTimeSchema,
  lastTouchedAt: IsoDateTimeSchema,
  status: z.enum(["active", "done", "abandoned"]).default("active"),
});

export type WorkItem = z.infer<typeof WorkItemSchema>;

/** Settled by the next quiz on the concept or by an item on it closing */
export const OpenDisputeSchema = z.object({
  conceptId: ConceptIdSchema,
  /** Discount for disputing the same concept again, counted over the whole log */
  weight: UnitIntervalSchema,
  raisedAt: IsoDateTimeSchema,
});

export type OpenDispute = z.infer<typeof OpenDisputeSchema>;

/** What the tutor is waiting on. One at a time, so a quiz and a question never compete for the reply */
export const PendingSchema = z.discriminatedUnion("type", [
  OpenQuizSchema,
  OpenElicitationSchema,
]);

export type Pending = z.infer<typeof PendingSchema>;

export function pendingQuiz(session: SessionState): OpenQuiz | null {
  return session.pending?.type === "quiz" ? session.pending : null;
}

export function pendingQuestion(session: SessionState): OpenElicitation | null {
  return session.pending?.type === "question" ? session.pending : null;
}

export const SESSION_STATE_SCHEMA_VERSION = 2;

export const SessionStateSchema = z.object({
  schemaVersion: z.literal(SESSION_STATE_SCHEMA_VERSION),
  sessionId: SessionIdSchema,
  userId: UserIdSchema,
  repoRoot: z.string().min(1),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  items: z.array(WorkItemSchema).default([]),
  activeItemId: ItemIdSchema.nullable().default(null),
  findings: z.array(FindingSchema).default([]),
  contextFiles: z.array(z.string().min(1)).default([]),
  pending: PendingSchema.nullable().default(null),
  dispute: OpenDisputeSchema.nullable().default(null),
  lastElicitedTurn: z.number().int().nonnegative().nullable().default(null),
  elicitationsAsked: z.number().int().nonnegative().default(0),
  consecutiveIgnored: z.number().int().nonnegative().default(0),
  turnCount: z.number().int().nonnegative().default(0),
});

export type SessionState = z.infer<typeof SessionStateSchema>;
