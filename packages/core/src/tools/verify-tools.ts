import { z } from "zod";

import type { ConceptId } from "../concepts";
import type { PendingPrediction } from "../schemas/elicitation";
import { classifyRun } from "../verify/classify";
import { parseCommand, runCommand, truncateOutput } from "../verify/runner";
import type { ToolContext } from "./context";
import type { Tool } from "./registry";

const VerifyArgs = z.object({
  subpath: z.string().optional(),
  intentId: z.string().min(1).optional(),
});

/** Runs the project's own test command and records the result */
export const verify: Tool<ToolContext> = {
  definition: {
    name: "verify",
    description:
      "Run the project's tests and report the result. Use it after the user says they have finished an attempt, instead of judging their code by reading it.",
    parameters: {
      type: "object",
      properties: {
        subpath: {
          type: "string",
          description:
            "Subproject directory to test, when the repository has more than one.",
        },
        intentId: {
          type: "string",
          description: "The exercise this run verifies, when one is open.",
        },
      },
      required: [],
    },
  },

  async execute(rawArgs, context) {
    const args = VerifyArgs.parse(rawArgs);
    const repo = await context.storage.loadRepoModel(context.session.repoRoot);

    if (repo === null) {
      return {
        content: "repository not indexed yet — ask the user to run /index",
        isError: true,
      };
    }

    const subproject =
      args.subpath === undefined
        ? repo.subprojects.find((sub) => sub.testCommand !== undefined)
        : repo.subprojects.find((sub) => sub.path === args.subpath);

    if (subproject?.testCommand === undefined) {
      return {
        content:
          "no test command known for this project — the user can add one, or describe how they run their tests",
        isError: true,
      };
    }

    const cwd =
      subproject.path === "."
        ? context.session.repoRoot
        : `${context.session.repoRoot}/${subproject.path}`;

    const result = await runCommand(parseCommand(subproject.testCommand), {
      cwd,
    });
    const report = classifyRun(result, subproject.testCommand);

    if (!report.isEvidence) {
      return {
        content: `${report.summary}\n\n${truncateOutput(report.output)}`,
      };
    }

    const intent = context.session.intents.find((i) => i.id === args.intentId);
    const conceptId = intent?.conceptId ?? activeConcept(context);
    let prediction: PendingPrediction | null = null;

    if (conceptId !== null) {
      prediction = takePrediction(context, conceptId);

      const resolveIntent = context.session.intents.find(
        (i) =>
          i.kind === "resolve" &&
          i.status === "active" &&
          i.conceptId === conceptId,
      );

      const at = context.clock.now().toISOString();

      if (resolveIntent?.kind === "resolve") {
        resolveIntent.attempts += 1;
        resolveIntent.lastTouchedAt = at;
        if (report.outcome === "pass") resolveIntent.status = "done";
      }
      if (intent !== undefined) {
        intent.lastTouchedAt = at;
        if (report.outcome === "pass") intent.status = "done";
      }

      context.pendingEvidence.push({
        kind: "test_run",
        conceptId,
        provenance: "execution",
        outcome: report.outcome === "pass" ? "pass" : "fail",
        helpDepth:
          resolveIntent?.kind === "resolve" ? resolveIntent.step : undefined,
        filePath: intent?.kind === "exercise" ? intent.targetFile : undefined,
        predicted: prediction?.predicted,
        selfConfidence: prediction?.selfConfidence,
        note: subproject.testCommand,
      });
    }

    const surprise =
      prediction !== null && prediction.predicted !== report.outcome
        ? `\n\nThey predicted ${prediction.predicted} and it ${report.outcome === "pass" ? "passed" : "failed"}. Work through why their expectation was wrong before anything else — a violated expectation is when a mental model is most open to correction.`
        : "";

    return {
      content: `${report.summary}\n\n${truncateOutput(report.output)}${surprise}`,
    };
  },
};

/** Concept of the active intent, when the model did not name one */
function activeConcept(context: ToolContext): ConceptId | null {
  const active = context.session.intents.find(
    (i) => i.id === context.session.activeIntentId,
  );
  return active?.conceptId ?? null;
}

function takePrediction(
  context: ToolContext,
  conceptId: ConceptId,
): PendingPrediction | null {
  const pending = context.session.pendingPrediction;
  context.session.pendingPrediction = null;
  return pending !== null && pending.conceptId === conceptId ? pending : null;
}
