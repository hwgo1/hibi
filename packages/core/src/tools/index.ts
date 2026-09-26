import type { ToolContext } from "./context";
import { answerQuiz, askQuiz, disputeMastery } from "./quiz-tools";
import { ToolRegistry } from "./registry";
import {
  demonstrateCode,
  explainConcept,
  giveHint,
  proposeExercise,
} from "./teaching";
import { verify } from "./verify-tools";
import { listFiles, readFile, recordAttempt } from "./workspace-tools";

export function buildToolRegistry(): ToolRegistry<ToolContext> {
  return new ToolRegistry<ToolContext>()
    .register(explainConcept)
    .register(demonstrateCode)
    .register(proposeExercise)
    .register(giveHint)
    .register(askQuiz)
    .register(answerQuiz)
    .register(disputeMastery)
    .register(verify)
    .register(listFiles)
    .register(readFile)
    .register(recordAttempt);
}

export * from "./context";
export * from "./registry";
