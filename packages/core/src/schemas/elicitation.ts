import { z } from "zod";

import { ConceptIdSchema } from "../concepts";
import { IsoDateTimeSchema, ItemIdSchema } from "../ids";

export const ELICITATION_KINDS = [
  "prior_knowledge",
  "prediction",
  "recap",
] as const;

export const ElicitationKindSchema = z.enum(ELICITATION_KINDS);
export type ElicitationKind = z.infer<typeof ElicitationKindSchema>;

export const ELICITATION_SCHEMA_VERSION = 1;

export const OpenElicitationSchema = z.object({
  type: z.literal("question"),
  schemaVersion: z.literal(ELICITATION_SCHEMA_VERSION),
  kind: ElicitationKindSchema,
  conceptId: ConceptIdSchema,
  itemId: ItemIdSchema.optional(),
  question: z.string().min(1),
  askedAt: IsoDateTimeSchema,
});

export type OpenElicitation = z.infer<typeof OpenElicitationSchema>;
