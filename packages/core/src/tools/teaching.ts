import { z } from "zod";

import type { ItemId } from "../ids";
import {
  deriveEntryStep,
  effortFloorMet,
  nextStep,
  STEP_INSTRUCTIONS,
} from "../policy/hint-ladder";
import type { Check } from "../schemas/check";
import type { HintStep, Ladder } from "../schemas/session";
import { buildCheck, describeCheck } from "../verify/checks";
import { ConceptTermArg, ParentTermArg, resolveTerm } from "./concept-term";
import type { ToolContext } from "./context";
import { findOpenItem } from "./items";
import { defineTool, type Tool } from "./registry";

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export const explainConcept: Tool<ToolContext> = defineTool({
  name: "explain_concept",
  description:
    "Open an explanation of a concept. Use when the user wants to understand something, not when they are stuck on their own attempt.",
  args: z.object({
    conceptTerm: ConceptTermArg,
    parentTerm: ParentTermArg,
  }),

  async execute(args, context: ToolContext) {
    const resolved = resolveTerm(context, args.conceptTerm, args.parentTerm);
    if (!resolved.ok) return resolved.outcome;

    context.pendingEvidence.push({
      kind: "concept_explained",
      conceptId: resolved.concept.id,
      provenance: "system",
    });

    const depth = context.learner.preferences.theoryDepth;
    return {
      content: `Concept: ${resolved.concept.canonicalName}. Explain it at ${depth} depth, in the user's language. No ladder applies here. Close with one check of understanding: a single ask_quiz question or a small propose_exercise.`,
    };
  },
});

/**
 * Exposition with complete code, for material that is convention rather than
 * reasoning: configuration syntax, an unfamiliar API or a build file
 */
export const demonstrateCode: Tool<ToolContext> = defineTool({
  name: "demonstrate_code",
  description:
    "Show complete, working code for something the user could only know by being told: syntax, configuration, conventions, an API they have not used. Never for the solution to an exercise or an attempt in progress.",
  args: z.object({
    conceptTerm: ConceptTermArg,
    parentTerm: ParentTermArg,
    subject: z.string().min(1).describe("What is being shown, in a few words."),
  }),

  async execute(args, context: ToolContext) {
    const resolved = resolveTerm(context, args.conceptTerm, args.parentTerm);
    if (!resolved.ok) return resolved.outcome;

    const conceptId = resolved.concept.id;
    const exerciseOpen = context.session.items.some(
      (item) => item.status === "active" && item.conceptId === conceptId,
    );

    if (exerciseOpen) {
      return {
        content:
          "An exercise on this concept is open. Do not show its solution; use give_hint for the user's attempt.",
        isError: true,
      };
    }

    context.pendingEvidence.push({
      kind: "code_demonstrated",
      conceptId,
      provenance: "system",
      note: args.subject,
    });

    return {
      content: `Show complete, working code for: ${args.subject}. Explain each part in the user's language. No ladder applies here.`,
    };
  },
});

/**
 * Registers an exercise and, when the project allows it, the tests that decide
 * it. An invalid check registers nothing, so a corrected retry never leaves a
 * duplicate behind
 */
export const proposeExercise: Tool<ToolContext> = defineTool({
  name: "propose_exercise",
  description:
    "Set an exercise for the user to attempt. The statement describes the task without solving it.",
  args: z.object({
    conceptTerm: ConceptTermArg,
    parentTerm: ParentTermArg,
    statement: z.string().min(1).describe("The task, in the user's language."),
    targetFile: z
      .string()
      .min(1)
      .optional()
      .describe("Repo-relative file where the user will write the solution."),
    check: z
      .object({
        file: z.string().min(1).optional().describe("Repo-relative test file."),
        tests: z
          .array(z.string().min(1))
          .optional()
          .describe(
            "Test names. Required for Go; Rust takes the full path, like tests::reverses.",
          ),
        subpath: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Subproject directory, when the repository has more than one.",
          ),
      })
      .optional()
      .describe(
        "The tests that decide the exercise. verify runs these and nothing else.",
      ),
  }),

  async execute(args, context: ToolContext) {
    let check: Check | undefined;
    let unchecked = "";
    if (args.check !== undefined) {
      const repo = await context.storage.loadRepoModel(
        context.session.repoRoot,
      );
      const built = buildCheck(repo, args.check);
      if (built.status === "invalid") {
        return {
          content: `Invalid check: ${built.reason}. Nothing was registered.`,
          isError: true,
        };
      }
      if (built.status === "ready") {
        check = built.check;
      } else {
        unchecked = ` No check attached: ${built.reason}. Judge attempts with record_attempt.`;
      }
    }

    const resolved = resolveTerm(context, args.conceptTerm, args.parentTerm);
    if (!resolved.ok) return resolved.outcome;

    const at = context.clock.now().toISOString();
    const id = newId("itm") as ItemId;

    context.session.items.push({
      id,
      kind: "exercise",
      conceptId: resolved.concept.id,
      statement: args.statement,
      targetFile: args.targetFile,
      check,
      attempts: 0,
      edits: 0,
      createdAt: at,
      lastTouchedAt: at,
      status: "active",
    });
    context.session.activeItemId = id;

    context.pendingEvidence.push({
      kind: "exercise_proposed",
      conceptId: resolved.concept.id,
      provenance: "system",
      filePath: args.targetFile,
    });

    const checked =
      check === undefined ? "" : ` verify will run ${describeCheck(check)}.`;

    return {
      content: `Exercise registered (${context.learner.preferences.exerciseSize} size).${checked}${unchecked} Present the statement to the user.`,
    };
  },
});

export const giveHint: Tool<ToolContext> = defineTool({
  name: "give_hint",
  description:
    "Help with an attempt the user has already made. Returns how deep you may go; write within that limit.",
  args: z.object({
    itemId: z.string().min(1).describe("The exercise being worked on."),
    userRequestedFullAnswer: z
      .boolean()
      .optional()
      .describe("True only when the user explicitly asked for the answer."),
  }),

  async execute(args, context: ToolContext) {
    const lookup = findOpenItem(context.session, args.itemId);
    if (!lookup.found) return { content: lookup.reason, isError: true };

    const { item } = lookup;
    const forced = args.userRequestedFullAnswer === true;
    const effort = effortFloorMet({ item, clock: context.clock });

    if (!effort.met && !forced) {
      const minutes = Math.ceil(effort.remainingMs / 60_000);
      return {
        content:
          `Too early for a hint: the user has not attempted this yet. ` +
          `Ask what they think the problem is, or suggest they run the tests. ` +
          `A hint becomes available after an attempt, or in about ${minutes} minute(s).`,
      };
    }

    const at = context.clock.now().toISOString();
    const ladder =
      item.ladder ??
      startLadder(
        deriveEntryStep({
          masteryLevel:
            context.learner.mastery.find(
              (entry) => entry.conceptId === item.conceptId,
            )?.level ?? null,
          attempts: item.attempts,
        }),
      );

    const step = nextStep({
      ladder,
      attempts: item.attempts,
      userRequested: forced,
      clock: context.clock,
    });

    item.ladder = {
      ...ladder,
      step,
      hintsGiven: ladder.hintsGiven + 1,
      attemptsAtLastHint: item.attempts,
      lastHintAt: at,
      forced: ladder.forced || forced,
    };
    item.lastTouchedAt = at;
    context.session.activeItemId = item.id;

    context.pendingEvidence.push({
      kind: "hint_given",
      conceptId: item.conceptId,
      provenance: "system",
      helpDepth: step,
      forced,
    });

    return { content: `Step ${step}. ${STEP_INSTRUCTIONS[step]}` };
  },
});

function startLadder(entryStep: HintStep): Ladder {
  return {
    entryStep,
    step: entryStep,
    hintsGiven: 0,
    attemptsAtLastHint: 0,
    forced: false,
  };
}
