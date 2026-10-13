import { z } from "zod";

export const TEST_RUNNERS = [
  "go",
  "bun",
  "vitest",
  "jest",
  "cargo",
  "pytest",
] as const;

export const TestRunnerSchema = z.enum(TEST_RUNNERS);
export type TestRunner = z.infer<typeof TestRunnerSchema>;

/** Stored as a selection, never as a command: argv is derived on every run */
export const CheckSchema = z.object({
  kind: z.literal("test"),
  runner: TestRunnerSchema,
  /** Relative to the repository root, "." for the root */
  cwd: z.string().min(1),
  /** Relative to `cwd` */
  file: z.string().min(1).optional(),
  /** Empty runs every test in `file` */
  tests: z.array(z.string().min(1)).default([]),
});

export type Check = z.infer<typeof CheckSchema>;
