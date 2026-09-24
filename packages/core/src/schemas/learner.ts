import { z } from "zod";

import { ConceptIdSchema } from "../concepts";
import {
  IsoDateTimeSchema,
  SlugSchema,
  UnitIntervalSchema,
  UserIdSchema,
} from "../ids";

/**
 * Settings the user declared explicitly. They configure how the tutor
 * addresses and teaches the user
 */
export const TeachingPreferencesSchema = z.object({
  name: z.string().max(40).default(""),
  language: z.string().min(2).default("pt-BR"),
  theoryDepth: z.enum(["minimal", "balanced", "thorough"]).default("balanced"),
  exerciseSize: z.enum(["small", "medium", "large"]).default("medium"),
  unsolicitedHints: z
    .enum(["never", "when-stuck", "proactive"])
    .default("when-stuck"),
  explanationStyle: z.enum(["concise", "detailed"]).default("concise"),
});

export type TeachingPreferences = z.infer<typeof TeachingPreferencesSchema>;

export const DEFAULT_TEACHING_PREFERENCES: TeachingPreferences =
  TeachingPreferencesSchema.parse({});

export const MASTERY_FORMULA_VERSION = 2;

export const MasteryEntrySchema = z.object({
  conceptId: ConceptIdSchema,
  level: UnitIntervalSchema,
  /** How far the estimate can be trusted, given volume and quality of evidence */
  confidence: UnitIntervalSchema,
  /** Events recorded against this concept itself */
  directEvidenceCount: z.number().int().nonnegative(),
  /** Events rolled up from descendants, weighted by distance */
  rolledUpEvidenceCount: z.number().int().nonnegative(),
  computedAt: IsoDateTimeSchema,
  formulaVersion: z.number().int().positive(),
  lastSeenAt: IsoDateTimeSchema,
});

export type MasteryEntry = z.infer<typeof MasteryEntrySchema>;

export const RecurringErrorSchema = z.object({
  id: SlugSchema,
  conceptId: ConceptIdSchema,
  description: z.string().min(1),
  occurrences: z.number().int().positive(),
  firstSeenAt: IsoDateTimeSchema,
  lastSeenAt: IsoDateTimeSchema,
});

export type RecurringError = z.infer<typeof RecurringErrorSchema>;

/**
 * Preference the tutor believes it observed. Kept apart from declared preferences:
 * inferred signals are advisory and lose to and explicit setting.
 */
export const InferredSignalSchema = z.object({
  key: SlugSchema,
  value: z.string().min(1),
  confidence: UnitIntervalSchema,
  evidenceCount: z.number().int().positive(),
  updatedAt: IsoDateTimeSchema,
});

export type InferredSignal = z.infer<typeof InferredSignalSchema>;

export const LEARNER_MODEL_SCHEMA_VERSION = 1;

export const LearnerModelSchema = z.object({
  schemaVersion: z.literal(LEARNER_MODEL_SCHEMA_VERSION),
  userId: UserIdSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  preferences: TeachingPreferencesSchema,
  mastery: z.array(MasteryEntrySchema).default([]),
  recurringErrors: z.array(RecurringErrorSchema).default([]),
  inferredSignals: z.array(InferredSignalSchema).default([]),
});

export type LearnerModel = z.infer<typeof LearnerModelSchema>;
