import { z } from "zod";

import { resolveConcept, validateConceptTerm } from "../concept-resolver";
import { deriveNextSteps } from "../goal/next-steps";
import { GOAL_SCHEMA_VERSION, GoalKindSchema } from "../schemas/goal";
import type { ToolContext } from "./context";
import type { Tool } from "./registry";

const SetGoalArgs = z.object({
  kind: GoalKindSchema,
  statement: z.string().min(1),
  language: z.string().min(1).optional(),
});

/**
 * Records what the learner is working toward.
 *
 * Stores the destination and nothing else. The steps are derived when needed,
 * so the objective never has to be revised as evidence accumulates — it just
 * points somewhere, and the route is recalculated each time.
 */
export const setGoal: Tool<ToolContext> = {
  definition: {
    name: "set_goal",
    description:
      "Record what the learner wants to work toward, such as learning a language, preparing for interviews or building something. Call it as soon as they say what they are after.",
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["language", "domain", "interview", "project"],
          description: "What shape the objective has.",
        },
        statement: {
          type: "string",
          description: "The objective in the learner's own words.",
        },
        language: {
          type: "string",
          description:
            "Programming language, when one is involved. English name, like Go.",
        },
      },
      required: ["kind", "statement"],
    },
  },

  async execute(rawArgs, context) {
    const args = SetGoalArgs.parse(rawArgs);
    const at = context.clock.now().toISOString();
    const previous = context.learner.goal;

    context.learner.goal = {
      schemaVersion: GOAL_SCHEMA_VERSION,
      kind: args.kind,
      statement: args.statement,
      language: args.language,
      skipped: [],
      createdAt: at,
      lastTouchedAt: at,
      status: "active",
    };

    const steps = deriveNextSteps(
      context.learner.goal,
      context.learner,
      context.registry,
      context.clock.now(),
    );

    const replaced =
      previous !== null && previous.status === "active"
        ? `Replaces "${previous.statement}". `
        : "";

    if (steps.length === 0) {
      return {
        content:
          `${replaced}Goal recorded. There is no history to work from yet, so ask one question — ` +
          `whether they already program, and in what — then start from the answer. One question, then teach.`,
      };
    }

    return {
      content: `${replaced}Goal recorded.\n\n${renderSteps(steps, context)}`,
    };
  },
};

/**
 * Returns the current objective and what to work on next.
 *
 * Steps are recomputed on every call rather than stored, so resuming after a
 * week reflects everything that happened since.
 */
export const nextSteps: Tool<ToolContext> = {
  definition: {
    name: "next_steps",
    description:
      "Get the learner's objective and what is worth working on next. Use it when they ask what to do, say to continue, or come back after a break.",
    parameters: { type: "object", properties: {}, required: [] },
  },

  async execute(_rawArgs, context) {
    const goal = context.learner.goal;

    if (goal === null || goal.status !== "active") {
      return {
        content:
          "No objective set. If they seem to want one, ask what they are working toward and call set_goal.",
      };
    }

    goal.lastTouchedAt = context.clock.now().toISOString();

    const steps = deriveNextSteps(
      goal,
      context.learner,
      context.registry,
      context.clock.now(),
    );

    if (steps.length === 0) {
      return {
        content:
          `Working toward: ${goal.statement}. Nothing in their history stands out as a gap, ` +
          `so ask what they want to go deeper on rather than proposing something arbitrary.`,
      };
    }

    return {
      content: `Working toward: ${goal.statement}.\n\n${renderSteps(steps, context)}`,
    };
  },
};

const SkipArgs = z.object({
  conceptTerm: z.string().min(1),
});

/**
 * Marks a concept as already known, on the learner's word.
 *
 * Accepted without proof: demanding a demonstration here would make claiming
 * knowledge more expensive than sitting through the explanation, and the
 * evidence is recorded as self-declared, which carries little weight and will
 * be corrected by anything they later do.
 */
export const skipConcept: Tool<ToolContext> = {
  definition: {
    name: "skip_concept",
    description:
      "Mark a concept as one the learner says they already know, so it stops being proposed. Accept it without testing them.",
    parameters: {
      type: "object",
      properties: {
        conceptTerm: {
          type: "string",
          description: "The concept in English, at most four words.",
        },
      },
      required: ["conceptTerm"],
    },
  },

  async execute(rawArgs, context) {
    const args = SkipArgs.parse(rawArgs);

    if (context.learner.goal === null) {
      return { content: "no objective is set", isError: true };
    }

    const problem = validateConceptTerm(args.conceptTerm);
    if (problem !== null)
      return { content: `Not a concept: ${problem}`, isError: true };

    const outcome = resolveConcept(context.registry, args.conceptTerm, {
      now: context.clock.now(),
    });

    if (outcome.status === "ambiguous") {
      return { content: "Ambiguous concept. Ask the user which one." };
    }
    context.registry = outcome.registry;

    const conceptId = outcome.concept.id;

    if (!context.learner.goal.skipped.includes(conceptId)) {
      context.learner.goal.skipped.push(conceptId);
    }

    context.pendingEvidence.push({
      kind: "self_assessment",
      conceptId,
      provenance: "self_declared",
      confidence: 0.6,
      outcome: "pass",
      note: "skipped as already known",
    });

    return {
      content: `Noted — ${outcome.concept.canonicalName} will not come up again unless something suggests otherwise. Move on to the next step.`,
    };
  },
};

function renderSteps(
  steps: ReturnType<typeof deriveNextSteps>,
  context: ToolContext,
): string {
  const lines = ["Next, in order:"];

  for (const step of steps) {
    const concept = context.registry.concepts.find(
      (entry) => entry.id === step.conceptId,
    );
    const name = concept?.canonicalName ?? step.conceptId;
    lines.push(`  ${name} — ${describe(step.reason)}`);
  }

  lines.push(
    "",
    "Present two or three of these in one short line each, then start on the first.",
    "Do not lay out a syllabus: these are recomputed every session and will change.",
  );

  return lines.join("\n");
}

function describe(
  reason: ReturnType<typeof deriveNextSteps>[number]["reason"],
): string {
  switch (reason) {
    case "untouched":
      return "never covered";
    case "weak":
      return "attempted, not solid yet";
    case "unverified":
      return "claimed but never demonstrated";
    case "stale":
      return "solid once, not touched in weeks";
  }
}
