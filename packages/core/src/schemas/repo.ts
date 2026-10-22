import { z } from "zod";

import { IsoDateTimeSchema, SlugSchema } from "../ids";
import { TestRunnerSchema } from "./check";

/**
 * Where a file came from. Only `user` code is evidence about the learner;
 * scaffolding, vendored and generated code must not calibrate teaching.
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
  /** Path relative to repoRoot. "." for a single-project repository. */
  path: z.string().min(1),
  languages: z.array(z.string().min(1)).default([]),
  /**
   * Declared language or runtime version, from the project manifest. Models
   * trained before a version change teach its older semantics with confidence,
   * so the tutor is told which version is actually in use.
   */
  languageVersion: z.string().min(1).optional(),
  testCommand: z.string().min(1).optional(),
  /** Runner hibi drives to run single tests. Absent when it cannot select them */
  testRunner: TestRunnerSchema.optional(),
});

export type Subproject = z.infer<typeof SubprojectSchema>;

export const FileStatsSchema = z.object({
  total: z.number().int().nonnegative(),
  user: z.number().int().nonnegative(),
  external: z.number().int().nonnegative(),
  generated: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
});

/**
 * Changes whenever the indexer's output changes. A model written by another
 * version is discarded and the repository indexed again, never translated
 */
export const REPO_MODEL_SCHEMA_VERSION = 2;

export const RepoModelSchema = z.object({
  schemaVersion: z.literal(REPO_MODEL_SCHEMA_VERSION),
  repoRoot: z.string().min(1),
  indexedAt: IsoDateTimeSchema,
  /** Without git, authorship is undeterminable and origin degrades to unknown */
  hasGit: z.boolean(),
  subprojects: z.array(SubprojectSchema).min(1),
  fileStats: FileStatsSchema,
  userAuthoredFiles: z.array(z.string().min(1)).default([]),
  treeSummary: z.string().default(""),
});

export type RepoModel = z.infer<typeof RepoModelSchema>;
