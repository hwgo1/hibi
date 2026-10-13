import { z } from "zod";

import { ConceptIdSchema } from "../concepts";
import { IsoDateTimeSchema, SlugSchema, UnitIntervalSchema } from "../ids";

export const QuizOptionSchema = z.object({
  id: SlugSchema,
  text: z.string().min(1),
  misconception: z.string().min(1).optional(),
});

export type QuizOption = z.infer<typeof QuizOptionSchema>;

export const QUIZ_MIN_OPTIONS = 3;
export const QUIZ_MAX_OPTIONS = 5;

export const QuizQuestionSchema = z.object({
  id: SlugSchema,
  conceptId: ConceptIdSchema,
  prompt: z.string().min(1),
  options: z
    .array(QuizOptionSchema)
    .min(QUIZ_MIN_OPTIONS)
    .max(QUIZ_MAX_OPTIONS),
  correctOptionId: SlugSchema,
  explanation: z.string().min(1),
});

export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;

export const QuizResponseSchema = z.enum(["correct", "incorrect", "unknown"]);
export type QuizResponse = z.infer<typeof QuizResponseSchema>;

export const OPEN_QUIZ_SCHEMA_VERSION = 1;

export const OpenQuizSchema = z.object({
  schemaVersion: z.literal(OPEN_QUIZ_SCHEMA_VERSION),
  questions: z.array(QuizQuestionSchema).min(1),
  cursor: z.number().int().nonnegative(),
  askedAt: IsoDateTimeSchema,
  /** Set when the quiz settles an open dispute */
  disputeWeight: UnitIntervalSchema.optional(),
});

export type OpenQuiz = z.infer<typeof OpenQuizSchema>;
