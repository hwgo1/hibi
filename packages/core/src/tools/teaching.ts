import { z } from "zod";

import type { ConceptId } from "../concepts";
import {
  resolveConcept,
  validateConceptTerm,
  type ResolveOutcome,
} from "../concept-resolver";
import type { IntentId } from "../ids";
import {
  deriveEntryStep,
  nextStep,
  STEP_INSTRUCTIONS,
} from "../policy/hint-ladder";
import type { ResolveIntent } from "../schemas/session";
import type { ToolContext } from "./context";
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
        conceptTerm: {
          type: "string",
          description:
            "The topic in English, at most four words. Never a question or a sentence.",
        },
        parentTerm: {
          type: "string",
          description: "A broader concept that already exists in the registry.",
        },
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

    const at = touch(context);
    const id = newId("int") as IntentId;

    context.session.intents.push({
      id,
      kind: "explain",
      conceptId: outcome.concept.id,
      createdAt: at,
      lastTouchedAt: at,
      status: "active",
    });
    context.session.activeIntentId = id;

    context.pendingEvidence.push({
      kind: "concept_explained",
      conceptId: outcome.concept.id,
      confidence: 0.2,
      outcome: "n/a",
    });

    const depth = context.learner.preferences.theoryDepth;
    return {
      content: `Concept: ${outcome.concept.canonicalName}. Explain it at ${depth} depth, in the user's language. No ladder applies here.`,
    };
  },
};

const ExerciseArgs = z.object({
  conceptTerm: z.string().min(1),
  parentTerm: z.string().min(1).optional(),
  statement: z.string().min(1),
  targetFile: z.string().min(1).optional(),
});

export const proposeExercise: Tool<ToolContext> = {
  definition: {
    name: "propose_exercise",
    description:
      "Set an exercise for the user to attempt. The statement describes the task without solving it.",
    parameters: {
      type: "object",
      properties: {
        conceptTerm: {
          type: "string",
          description:
            "The topic in English, at most four words. Never a question or a sentence.",
        },
        parentTerm: {
          type: "string",
          description: "A broader concept that already exists in the registry.",
        },
        statement: {
          type: "string",
          description: "The task, in the user's language.",
        },
        targetFile: { type: "string" },
      },
      required: ["conceptTerm", "parentTerm", "statement"],
    },
  },

  async execute(rawArgs, context) {
    const args = ExerciseArgs.parse(rawArgs);
    const outcome = resolve(context, args.conceptTerm, args.parentTerm);

    if (outcome.status === "rejected") {
      return { content: `Not a concept: ${outcome.reason}`, isError: true };
    }
    if (outcome.status === "ambiguous") {
      return { content: "Ambiguous concept. Ask the user which one." };
    }

    const at = touch(context);
    const id = newId("int") as IntentId;

    context.session.intents.push({
      id,
      kind: "exercise",
      conceptId: outcome.concept.id,
      statement: args.statement,
      targetFile: args.targetFile,
      createdAt: at,
      lastTouchedAt: at,
      status: "active",
    });
    context.session.activeIntentId = id;

    context.pendingEvidence.push({
      kind: "exercise_proposed",
      conceptId: outcome.concept.id,
      confidence: 0.1,
      outcome: "n/a",
    });

    return {
      content: `Exercise registered (${context.learner.preferences.exerciseSize} size). Present the statement to the user.`,
    };
  },
};

const HintArgs = z.object({
  targetIntentId: z.string().min(1),
  userRequestedFullAnswer: z.boolean().optional(),
});

/**
 * The governed path. Note the absence of a depth argument: the step is
 * derived from session state, so the model cannot ask for a deeper hint and
 * there is no refusal to negotiate.
 */
export const giveHint: Tool<ToolContext> = {
  definition: {
    name: "give_hint",
    description:
      "Help with an attempt the user has already made. Returns how deep you may go; write within that limit.",
    parameters: {
      type: "object",
      properties: {
        targetIntentId: {
          type: "string",
          description: "The exercise or finding being worked on.",
        },
        userRequestedFullAnswer: {
          type: "boolean",
          description:
            "True only when the user explicitly asked for the answer.",
        },
      },
      required: ["targetIntentId"],
    },
  },

  async execute(rawArgs, context) {
    const args = HintArgs.parse(rawArgs);
    const at = touch(context);

    const source = context.session.intents.find(
      (i) => i.id === args.targetIntentId,
    );
    if (source === undefined) {
      return {
        content: `unknown intent: ${args.targetIntentId}`,
        isError: true,
      };
    }

    let resolveIntent = findResolveIntent(context, args.targetIntentId);

    if (resolveIntent === undefined) {
      const mastery = context.learner.mastery.find(
        (m) => m.conceptId === source.conceptId,
      );
      const entryStep = deriveEntryStep({
        hasExistingCode: true,
        questionIsSpecific: true,
        masteryLevel: mastery?.level ?? null,
        selfReportedAttempts: 0,
      });

      resolveIntent = {
        id: newId("int") as IntentId,
        kind: "resolve",
        conceptId: source.conceptId,
        target: { type: "exercise", intentId: args.targetIntentId as IntentId },
        entryStep,
        step: entryStep,
        attempts: 0,
        hintsGiven: 0,
        attemptsAtLastHint: 0,
        createdAt: at,
        lastTouchedAt: at,
        status: "active",
        userForcedDisclosure: false,
      };
      context.session.intents.push(resolveIntent);
    }

    const step = nextStep({
      intent: resolveIntent,
      userRequested: args.userRequestedFullAnswer === true,
      clock: context.clock,
    });

    resolveIntent.step = step;
    resolveIntent.hintsGiven += 1;
    resolveIntent.attemptsAtLastHint = resolveIntent.attempts;
    resolveIntent.lastHintAt = at;
    resolveIntent.lastTouchedAt = at;
    if (args.userRequestedFullAnswer === true)
      resolveIntent.userForcedDisclosure = true;
    context.session.activeIntentId = resolveIntent.id;

    context.pendingEvidence.push({
      kind: "hint_given",
      conceptId: resolveIntent.conceptId,
      confidence: 0.3,
      outcome: "n/a",
      helpDepth: step,
    });

    return { content: `Step ${step}. ${STEP_INSTRUCTIONS[step]}` };
  },
};

function findResolveIntent(
  context: ToolContext,
  targetId: string,
): ResolveIntent | undefined {
  for (const intent of context.session.intents) {
    if (intent.kind !== "resolve") continue;
    if (intent.status !== "active") continue;
    if (
      intent.target.type === "exercise" &&
      intent.target.intentId === targetId
    )
      return intent;
    if (
      intent.target.type === "finding" &&
      intent.target.findingId === targetId
    )
      return intent;
  }
  return undefined;
}
