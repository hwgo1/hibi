import { z } from "zod";
import { IsoDateTimeSchema, SlugSchema } from "../ids";

/**
 * Where a file came from. Only `user` code is evidence about the learner;
 * scaffolding, vendored and generated code must not calibrate teaching
 */
export const FileOriginSchema = z.enum([
  "user",
  "external",
  "generated",
  "unknown",
]);
export type FileOrigin = z.infer<typeof FileOriginSchema>;

export const SubprojectSchema = z.object({
  id: SlugSchema,
  path: z.string().min(1),
  languages: z.array(z.string().min(1)).default([]),
  entrypoints: z.array(z.string().min(1)).default([]),
  dependencies: z.array(z.string().min(1)).default([]),
  testCommand: z.string().min(1).optional(),
});

export type Subproject = z.infer<typeof SubprojectSchema>;

export const FileStatsSchema = z.object({
  total: z.number().int().nonnegative(),
  user: z.number().int().nonnegative(),
  external: z.number().int().nonnegative(),
  generated: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
});

export const REPO_MODEL_SCHEMA_VERSION = 1;

export const RepoModelSchema = z.object({
  schemaVersion: z.literal(REPO_MODEL_SCHEMA_VERSION),
  repoRoot: z.string().min(1),
  indexedAt: IsoDateTimeSchema,
  /** Without git, authorship is undeterminable and origins degrades to unknown  */
  hasGit: z.boolean(),
  subprojects: z.array(SubprojectSchema).min(1),
  fileStats: FileStatsSchema,
  userAuthoredFiles: z.array(z.string().min(1)).default([]),
  ignoredPatterns: z.array(z.string().min(1)).default([]),
  treeSummary: z.string().default(""),
});

export type RepoModel = z.infer<typeof RepoModelSchema>;
