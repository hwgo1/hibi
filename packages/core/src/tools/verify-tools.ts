import { join } from "node:path";
import { z } from "zod";

import { checkFile, planCheck } from "../verify/checks";
import { classifyRun } from "../verify/classify";
import { runCommand, truncateOutput } from "../verify/runner";
import { TEST_RUNNER_SPECS } from "../verify/test-runners";
import type { ToolContext } from "./context";
import { completeItem, findOpenItem } from "./items";
import type { Tool } from "./registry";

const VerifyArgs = z.object({
  itemId: z.string().min(1).optional(),
});

export const verify: Tool<ToolContext> = {
  definition: {
    name: "verify",
    description:
      "Run the exercise's check, its own tests and nothing else, and report the result. Use it when the user says an attempt is done, instead of judging their code by reading it.",
    parameters: {
      type: "object",
      properties: {
        itemId: {
          type: "string",
          description: "The exercise. Defaults to the active one.",
        },
      },
      required: [],
    },
  },

  async execute(rawArgs, context) {
    const args = VerifyArgs.parse(rawArgs);
    const lookup = findOpenItem(context.session, args.itemId);
    if (!lookup.found) return { content: lookup.reason, isError: true };

    const { item } = lookup;
    item.lastTouchedAt = context.clock.now().toISOString();

    const check = item.check;
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

    if (report.isAttempt) item.attempts += 1;

    if (!report.isEvidence) {
      return { content: paragraphs(report.summary, output) };
    }

    const outcome = report.outcome === "pass" ? "pass" : "fail";
    if (outcome === "pass") completeItem(context.session, item);

    const prediction = item.prediction;
    item.prediction = undefined;
    context.pendingEvidence.push({
      kind: "test_run",
      conceptId: item.conceptId,
      provenance: "execution",
      outcome,
      helpDepth: item.ladder?.step,
      forced: item.ladder?.forced,
      filePath: item.targetFile ?? file,
      predicted: prediction?.predicted,
      selfConfidence: prediction?.selfConfidence,
      note: command,
    });

    const surprise =
      prediction !== undefined && prediction.predicted !== outcome
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

function paragraphs(...parts: string[]): string {
  return parts.filter((part) => part.length > 0).join("\n\n");
}
