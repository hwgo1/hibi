import { z } from "zod";
import { IsoDateTimeSchema, SlugSchema } from "./ids";

export const ConceptIdSchema = SlugSchema.brand<"ConceptId">();
export type ConceptId = z.infer<typeof ConceptIdSchema>;

export const ConceptSourceSchema = z.enum(["seed", "proposed"]);
export type ConceptSource = z.infer<typeof ConceptSourceSchema>;

/** Maximum depth from a root. Keeps the tree wide so evidence aggregates into meaningful parents */
export const MAX_CONCEPT_DEPTH = 4;

export const ConceptSchema = z.object({
  id: ConceptIdSchema,
  canonicalName: z.string().min(1),
  aliases: z.array(z.string().min(1)).default([]),
  parentId: ConceptIdSchema.nullable().default(null),
  requires: z.array(ConceptIdSchema).optional(),
  source: ConceptSourceSchema,
  createdAt: IsoDateTimeSchema,
  mergedInto: ConceptIdSchema.nullable().default(null),
});

export type Concept = z.infer<typeof ConceptSchema>;

export const CONCEPT_REGISTRY_SCHEMA_VERSION = 1;

export const ConceptRegistrySchema = z.object({
  schemaVersion: z.literal(CONCEPT_REGISTRY_SCHEMA_VERSION),
  updatedAt: IsoDateTimeSchema,
  concepts: z.array(ConceptSchema).default([]),
});

export type ConceptRegistry = z.infer<typeof ConceptRegistrySchema>;

/**
 * Broad roots shipped with hibi. They exist to give proposed concepts a parent
 * so narrow topics still accumulate evidence at a useful level
 */
export const SEED_CONCEPTS: ReadonlyArray<{
  id: string;
  canonicalName: string;
  parentId: string | null;
}> = [
  {
    id: "programming-fundamentals",
    canonicalName: "Programming fundamentals",
    parentId: null,
  },
  {
    id: "data-structures",
    canonicalName: "Data structures",
    parentId: "programming-fundamentals",
  },
  {
    id: "algorithms",
    canonicalName: "Algorithms",
    parentId: "programming-fundamentals",
  },
  {
    id: "concurrency",
    canonicalName: "Concurrency",
    parentId: "programming-fundamentals",
  },
  {
    id: "error-handling",
    canonicalName: "Error handling",
    parentId: "programming-fundamentals",
  },
  { id: "software-design", canonicalName: "Software design", parentId: null },
  {
    id: "testing",
    canonicalName: "Automated testing",
    parentId: "software-design",
  },
  { id: "backend", canonicalName: "Backend development", parentId: null },
  { id: "databases", canonicalName: "Databases", parentId: "backend" },
  {
    id: "networking",
    canonicalName: "Networking and protocols",
    parentId: "backend",
  },
  { id: "frontend", canonicalName: "Frontend development", parentId: null },
  { id: "tooling", canonicalName: "Tooling and build systems", parentId: null },
];

/** Builds the initial registry */
export function seedRegistry(now: Date): ConceptRegistry {
  const at = now.toISOString();
  return {
    schemaVersion: CONCEPT_REGISTRY_SCHEMA_VERSION,
    updatedAt: at,
    concepts: SEED_CONCEPTS.map((c) => ({
      id: c.id as ConceptId,
      canonicalName: c.canonicalName,
      aliases: [],
      parentId: (c.parentId as ConceptId | null) ?? null,
      source: "seed" as const,
      createdAt: at,
      mergedInto: null,
    })),
  };
}
