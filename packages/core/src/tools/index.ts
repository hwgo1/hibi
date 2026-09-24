import type { ToolContext } from "./context";
import { ToolRegistry } from "./registry";
import {
  demonstrateCode,
  explainConcept,
  giveHint,
  proposeExercise,
} from "./teaching";
import { listFiles, readFile, recordAttempt } from "./workspace-tools";

export function buildToolRegistry(): ToolRegistry<ToolContext> {
  return new ToolRegistry<ToolContext>()
    .register(explainConcept)
    .register(demonstrateCode)
    .register(proposeExercise)
    .register(giveHint)
    .register(listFiles)
    .register(readFile)
    .register(recordAttempt);
}

export * from "./context";
export * from "./registry";
