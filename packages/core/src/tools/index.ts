import type { ToolContext } from "./context";
import { ToolRegistry } from "./registry";
import { explainConcept, giveHint, proposeExercise } from "./teaching";
import { listFiles, readFile, recordAttempt } from "./workspace-tools";

/**
 * The full tool surface. No tool writes a solution: the constraint is
 * structural rather than an instruction the model may ignore.
 */
export function buildToolRegistry(): ToolRegistry<ToolContext> {
  return new ToolRegistry<ToolContext>()
    .register(explainConcept)
    .register(proposeExercise)
    .register(giveHint)
    .register(listFiles)
    .register(readFile)
    .register(recordAttempt);
}

export * from "./context";
export * from "./registry";
