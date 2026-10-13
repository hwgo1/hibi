import { join } from "node:path";
import { z } from "zod";

import type { ConceptId } from "../concepts";
import type { PendingPrediction } from "../schemas/elicitation";
import { checkFile, planCheck } from "../verify/checks";
import { classifyRun } from "../verify/classify";
import { runCommand, truncateOutput } from "../verify/runner";
import { TEST_RUNNER_SPECS } from "../verify/test-runners";
import { findAttemptTarget } from "./attempt-target";
import type { ToolContext } from "./context";
import type { Tool } from "./registry";

const VerifyArgs = z.object({
  intentId: z.string().min(1).optional(),
});

/** Runs an exercise's check and records the result when tests decided it */
export const verify: Tool<ToolContext> = {
  definition: {
    name: "verify",
    description:
      "Run the exercise's check, its own tests and nothing else, and report the result. Use it when the user says an attempt is done, instead of judging their code by reading it.",
    parameters: {
      type: "object",
      properties: {
        intentId: {
          type: "string",
          description:
            "The exercise or its hint ladder. Defaults to the active one.",
        },
      },
      required: [],
    },
  },

  async execute(rawArgs, context) {
    const args = VerifyArgs.parse(rawArgs);
    const lookup = findAttemptTarget(context.session, args.intentId);
    if (!lookup.found) return { content: lookup.reason, isError: true };

    const { exercise, ladder } = lookup.target;
    const at = context.clock.now().toISOString();
    exercise.lastTouchedAt = at;

    const check = exercise.check;
    if (check === undefined) {
      return {
        content:
          "This exercise has no check, so no test can decide it. Judge the attempt and record it with record_attempt.",
        isError: true,
      };
    }

    const plan = planCheck(check);
    if (!plan.ok) {
      return { content: `invalid check: ${plan.reason}`, isError: true };
    }

    const file = checkFile(check);
    if (file !== undefined && !(await exists(context, file))) {
      return {
        content: `${file} does not exist yet, so the check has nothing to run. If the user has not written the test, show it to them.`,
      };
    }

    const spec = TEST_RUNNER_SPECS[check.runner];
    const result = await runCommand(plan.argv, {
      cwd: join(context.session.repoRoot, check.cwd),
    });
    const run = spec.read(result.stdout, result.stderr);
    const command = plan.argv.join(" ");
    const report = classifyRun(result, run, spec.noTests, command);
    const output = truncateOutput(run.output);

    if (report.isAttempt && ladder !== undefined) {
      ladder.attempts += 1;
      ladder.lastTouchedAt = at;
    }

    if (!report.isEvidence) {
      return { content: paragraphs(report.summary, output) };
    }

    const outcome = report.outcome === "pass" ? "pass" : "fail";
    if (outcome === "pass") {
      exercise.status = "done";
      if (ladder !== undefined) ladder.status = "done";
    }

    const prediction = takePrediction(context, exercise.conceptId);
    context.pendingEvidence.push({
      kind: "test_run",
      conceptId: exercise.conceptId,
      provenance: "execution",
      outcome,
      helpDepth: ladder?.step,
      filePath: exercise.targetFile ?? file,
      predicted: prediction?.predicted,
      selfConfidence: prediction?.selfConfidence,
      note: command,
    });

    const surprise =
      prediction !== null && prediction.predicted !== outcome
        ? `They predicted ${prediction.predicted} and it ${outcome === "pass" ? "passed" : "failed"}. Work through why their expectation was wrong before anything else — a violated expectation is when a mental model is most open to correction.`
        : "";

    return { content: paragraphs(report.summary, output, surprise) };
  },
};

async function exists(context: ToolContext, path: string): Promise<boolean> {
  try {
    await context.workspace.readFile(path);
    return true;
  } catch {
    return false;
  }
}

function takePrediction(
  context: ToolContext,
  conceptId: ConceptId,
): PendingPrediction | null {
  const pending = context.session.pendingPrediction;
  context.session.pendingPrediction = null;
  return pending !== null && pending.conceptId === conceptId ? pending : null;
}

function paragraphs(...parts: string[]): string {
  return parts.filter((part) => part.length > 0).join("\n\n");
}
