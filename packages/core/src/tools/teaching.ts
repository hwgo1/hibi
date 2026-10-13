import { z } from "zod";

import type { ConceptId } from "../concepts";
import {
  resolveConcept,
  validateConceptTerm,
  type ResolveOutcome,
} from "../concept-resolver";
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
import type { ToolContext } from "./context";
import { findOpenItem } from "./items";
import type { Tool } from "./registry";

type ResolveResult = ResolveOutcome | { status: "rejected"; reason: string };

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Resolves a natural-language term to a canonical concept and stores the
 * possibly-updated registry back on the context.
 */
function resolve(
  context: ToolContext,
  term: string,
  parentHint?: string,
): ResolveResult {
  const problem = validateConceptTerm(term);
  if (problem !== null) return { status: "rejected", reason: problem };

  const outcome = resolveConcept(context.registry, term, {
    parentHint: parentHint as ConceptId | undefined,
    now: context.clock.now(),
  });

  if (outcome.status === "ambiguous") return outcome;
  context.registry = outcome.registry;
  return outcome;
}

function touch(context: ToolContext): string {
  return context.clock.now().toISOString();
}

const CONCEPT_TERM_SCHEMA = {
  type: "string",
  description:
    "The topic in English, at most four words. Never a question or a sentence.",
} as const;

const PARENT_TERM_SCHEMA = {
  type: "string",
  description: "A broader concept that already exists in the registry.",
} as const;

const ExplainArgs = z.object({
  conceptTerm: z.string().min(1),
  parentTerm: z.string().min(1).optional(),
});

export const explainConcept: Tool<ToolContext> = {
  definition: {
    name: "explain_concept",
    description:
      "Open an explanation of a concept. Use when the user wants to understand something, not when they are stuck on their own attempt.",
    parameters: {
      type: "object",
      properties: {
        conceptTerm: CONCEPT_TERM_SCHEMA,
        parentTerm: PARENT_TERM_SCHEMA,
      },
      required: ["conceptTerm", "parentTerm"],
    },
  },

  async execute(rawArgs, context) {
    const args = ExplainArgs.parse(rawArgs);
    const outcome = resolve(context, args.conceptTerm, args.parentTerm);

    if (outcome.status === "rejected") {
      return { content: `Not a concept: ${outcome.reason}`, isError: true };
    }
    if (outcome.status === "ambiguous") {
      return {
        content: `Ambiguous concept. Candidates: ${outcome.candidates
          .map((c) => c.canonicalName)
          .join(", ")}. Ask the user which one.`,
      };
    }

    context.pendingEvidence.push({
      kind: "concept_explained",
      conceptId: outcome.concept.id,
      provenance: "system",
    });

    const depth = context.learner.preferences.theoryDepth;
    return {
      content: `Concept: ${outcome.concept.canonicalName}. Explain it at ${depth} depth, in the user's language. No ladder applies here. Close with one check of understanding: a single ask_quiz question or a small propose_exercise.`,
    };
  },
};

const DemonstrateArgs = z.object({
  conceptTerm: z.string().min(1),
  parentTerm: z.string().min(1).optional(),
  subject: z.string().min(1),
});

/**
 * Exposition with complete code, for material that is convention rather than
 * reasoning: configuration syntax, an unfamiliar API or a build file
 */
export const demonstrateCode: Tool<ToolContext> = {
  definition: {
    name: "demonstrate_code",
    description:
      "Show complete, working code for something the user could only know by being told: syntax, configuration, conventions, an API they have not used. Never for the solution to an exercise or an attempt in progress.",
    parameters: {
      type: "object",
      properties: {
        conceptTerm: CONCEPT_TERM_SCHEMA,
        parentTerm: PARENT_TERM_SCHEMA,
        subject: {
          type: "string",
          description: "What is being shown, in a few words.",
        },
      },
      required: ["conceptTerm", "parentTerm", "subject"],
    },
  },

  async execute(rawArgs, context) {
    const args = DemonstrateArgs.parse(rawArgs);
    const outcome = resolve(context, args.conceptTerm, args.parentTerm);

    if (outcome.status === "rejected") {
      return { content: `Not a concept: ${outcome.reason}`, isError: true };
    }
    if (outcome.status === "ambiguous") {
      return { content: "Ambiguous concept. Ask the user which one." };
    }

    const conceptId = outcome.concept.id;
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
};

const CheckArgs = z.object({
  file: z.string().min(1).optional(),
  tests: z.array(z.string().min(1)).optional(),
  subpath: z.string().min(1).optional(),
});

const ExerciseArgs = z.object({
  conceptTerm: z.string().min(1),
  parentTerm: z.string().min(1).optional(),
  statement: z.string().min(1),
  targetFile: z.string().min(1).optional(),
  check: CheckArgs.optional(),
});

/**
 * Registers an exercise and, when the project allows it, the tests that decide
 * it. An invalid check registers nothing, so a corrected retry never leaves a
 * duplicate behind
 */
export const proposeExercise: Tool<ToolContext> = {
  definition: {
    name: "propose_exercise",
    description:
      "Set an exercise for the user to attempt. The statement describes the task without solving it.",
    parameters: {
      type: "object",
      properties: {
        conceptTerm: CONCEPT_TERM_SCHEMA,
        parentTerm: PARENT_TERM_SCHEMA,
        statement: {
          type: "string",
          description: "The task, in the user's language.",
        },
        targetFile: {
          type: "string",
          description:
            "Repo-relative file where the user will write the solution.",
        },
        check: {
          type: "object",
          description:
            "The tests that decide the exercise. verify runs these and nothing else.",
          properties: {
            file: {
              type: "string",
              description: "Repo-relative test file.",
            },
            tests: {
              type: "array",
              items: { type: "string" },
              description:
                "Test names. Required for Go; Rust takes the full path, like tests::reverses.",
            },
            subpath: {
              type: "string",
              description:
                "Subproject directory, when the repository has more than one.",
            },
          },
          required: [],
        },
      },
      required: ["conceptTerm", "parentTerm", "statement"],
    },
  },

  async execute(rawArgs, context) {
    const args = ExerciseArgs.parse(rawArgs);

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

    const outcome = resolve(context, args.conceptTerm, args.parentTerm);

    if (outcome.status === "rejected") {
      return { content: `Not a concept: ${outcome.reason}`, isError: true };
    }
    if (outcome.status === "ambiguous") {
      return { content: "Ambiguous concept. Ask the user which one." };
    }

    const at = touch(context);
    const id = newId("itm") as ItemId;

    context.session.items.push({
      id,
      kind: "exercise",
      conceptId: outcome.concept.id,
      statement: args.statement,
      targetFile: args.targetFile,
      check,
      attempts: 0,
      createdAt: at,
      lastTouchedAt: at,
      status: "active",
    });
    context.session.activeItemId = id;

    context.pendingEvidence.push({
      kind: "exercise_proposed",
      conceptId: outcome.concept.id,
      provenance: "system",
      filePath: args.targetFile,
    });

    const checked =
      check === undefined ? "" : ` verify will run ${describeCheck(check)}.`;

    return {
      content: `Exercise registered (${context.learner.preferences.exerciseSize} size).${checked}${unchecked} Present the statement to the user.`,
    };
  },
};

const HintArgs = z.object({
  itemId: z.string().min(1),
  userRequestedFullAnswer: z.boolean().optional(),
});

export const giveHint: Tool<ToolContext> = {
  definition: {
    name: "give_hint",
    description:
      "Help with an attempt the user has already made. Returns how deep you may go; write within that limit.",
    parameters: {
      type: "object",
      properties: {
        itemId: {
          type: "string",
          description: "The exercise being worked on.",
        },
        userRequestedFullAnswer: {
          type: "boolean",
          description:
            "True only when the user explicitly asked for the answer.",
        },
      },
      required: ["itemId"],
    },
  },

  async execute(rawArgs, context) {
    const args = HintArgs.parse(rawArgs);
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

    const at = touch(context);
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
};

function startLadder(entryStep: HintStep): Ladder {
  return {
    entryStep,
    step: entryStep,
    hintsGiven: 0,
    attemptsAtLastHint: 0,
    forced: false,
  };
}
