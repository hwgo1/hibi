import { z } from "zod";

import { ConceptIdSchema } from "../concepts";
import { IsoDateTimeSchema, UnitIntervalSchema } from "../ids";

export const GOAL_KINDS = [
  "language",
  "domain",
  "interview",
  "project",
] as const;

export const GoalKindSchema = z.enum(GOAL_KINDS);
export type GoalKind = z.infer<typeof GoalKindSchema>;

export const GOAL_SCHEMA_VERSION = 1;

export const GoalSchema = z.object({
  schemaVersion: z.literal(GOAL_SCHEMA_VERSION),
  kind: GoalKindSchema,
  statement: z.string().min(1),
  language: z.string().min(1).optional(),
  skipped: z.array(ConceptIdSchema).default([]),
  createdAt: IsoDateTimeSchema,
  lastTouchedAt: IsoDateTimeSchema,
  status: z.enum(["active", "paused", "done"]).default("active"),
});

export type Goal = z.infer<typeof GoalSchema>;

export const NextStepSchema = z.object({
  conceptId: ConceptIdSchema,
  level: UnitIntervalSchema,
  confidence: UnitIntervalSchema,
  reason: z.enum(["untouched", "weak", "stale", "unverified"]),
});

export type NextStep = z.infer<typeof NextStepSchema>;
