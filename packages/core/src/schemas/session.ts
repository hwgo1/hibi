import { z } from "zod";

import { ConceptIdSchema } from "../concepts";
import {
  FindingIdSchema,
  IntentIdSchema,
  IsoDateTimeSchema,
  SessionIdSchema,
  UnitIntervalSchema,
  UserIdSchema,
} from "../ids";
import { DisputeSchema, OpenQuizSchema } from "./quiz";

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

export const STALE_INTENT_THRESHOLD_MS = 72 * 60 * 60 * 1000;

export const HINT_STEPS = [1, 2, 3] as const;
export const HintStepSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export type HintStep = z.infer<typeof HintStepSchema>;

const IntentBase = {
  id: IntentIdSchema,
  createdAt: IsoDateTimeSchema,
  lastTouchedAt: IsoDateTimeSchema,
  /**
   * `stale` is distinct from `abandoned`: abandonment is a statement the user
   * made, staleness is an absence the system observed
   */
  status: z.enum(["active", "done", "abandoned", "stale"]).default("active"),
};

export const IntentSchema = z.discriminatedUnion("kind", [
  z.object({
    ...IntentBase,
    kind: z.literal("explain"),
    conceptId: ConceptIdSchema,
  }),
  z.object({
    ...IntentBase,
    kind: z.literal("demonstrate"),
    conceptId: ConceptIdSchema,
    subject: z.string().min(1),
  }),
  z.object({
    ...IntentBase,
    kind: z.literal("exercise"),
    conceptId: ConceptIdSchema,
    statement: z.string().min(1),
    targetFile: z.string().min(1).optional(),
  }),
  z.object({
    ...IntentBase,
    kind: z.literal("resolve"),
    conceptId: ConceptIdSchema,
    /** What is being worked on: an exercise hibi set or a finding it made */
    target: z.discriminatedUnion("type", [
      z.object({ type: z.literal("finding"), findingId: FindingIdSchema }),
      z.object({ type: z.literal("exercise"), intentId: IntentIdSchema }),
    ]),
    entryStep: HintStepSchema,
    step: HintStepSchema,
    attempts: z.number().int().nonnegative().default(0),
    hintsGiven: z.number().int().nonnegative().default(0),
    attemptsAtLastHint: z.number().int().nonnegative().default(0),
    lastHintAt: IsoDateTimeSchema.optional(),
    userForcedDisclosure: z.boolean().default(false),
  }),
]);

export type Intent = z.infer<typeof IntentSchema>;
export type ResolveIntent = Extract<Intent, { kind: "resolve" }>;

export const SESSION_STATE_SCHEMA_VERSION = 1;

export const SessionStateSchema = z.object({
  schemaVersion: z.literal(SESSION_STATE_SCHEMA_VERSION),
  sessionId: SessionIdSchema,
  userId: UserIdSchema,
  repoRoot: z.string().min(1),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  intents: z.array(IntentSchema).default([]),
  activeIntentId: IntentIdSchema.nullable().default(null),
  findings: z.array(FindingSchema).default([]),
  contextFiles: z.array(z.string().min(1)).default([]),
  openQuiz: OpenQuizSchema.nullable().default(null),
  disputes: z.array(DisputeSchema).default([]),
  turnCount: z.number().int().nonnegative().default(0),
});

export type SessionState = z.infer<typeof SessionStateSchema>;
