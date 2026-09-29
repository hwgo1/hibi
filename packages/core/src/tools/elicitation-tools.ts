import { z } from "zod";

import type { ConceptId } from "../concepts";
import { resolveConcept, validateConceptTerm } from "../concept-resolver";
import { shouldElicit, type ElicitationSeam } from "../elicitation/policy";
import type { IntentId } from "../ids";
import { ELICITATION_SCHEMA_VERSION } from "../schemas/elicitation";
import type { ToolContext } from "./context";
import type { Tool } from "./registry";

const AskArgs = z.object({
  seam: z.enum(["before_concept", "before_verify", "after_exercise"]),
  conceptTerm: z.string().min(1),
  parentTerm: z.string().min(1).optional(),
  question: z.string().min(1),
  intentId: z.string().min(1).optional(),
});

export const askLearner: Tool<ToolContext> = {
  definition: {
    name: "ask_learner",
    description:
      "Ask one short, specific question at a break: what the learner already knows before a new concept, what they expect their code to do before running it, or what the exercise came down to after it closes. May decline, in which case continue silently.",
    parameters: {
      type: "object",
      properties: {
        seam: {
          type: "string",
          enum: ["before_concept", "before_verify", "after_exercise"],
          description: "Where in the session this falls.",
        },
        conceptTerm: {
          type: "string",
          description: "The topic in English, at most four words.",
        },
        parentTerm: {
          type: "string",
          description: "A broader existing concept.",
        },
        question: {
          type: "string",
          description:
            "The question, in the learner's language. Must be specific to their code or the concept at hand, never generic.",
        },
        intentId: {
          type: "string",
          description: "The exercise this concerns, when there is one.",
        },
      },
      required: ["seam", "conceptTerm", "parentTerm", "question"],
    },
  },

  async execute(rawArgs, context) {
    const args = AskArgs.parse(rawArgs);

    const problem = validateConceptTerm(args.conceptTerm);
    if (problem !== null) {
      return { content: `Not a concept: ${problem}`, isError: true };
    }

    const decision = shouldElicit({
      session: context.session,
      seam: args.seam as ElicitationSeam,
      unsolicitedHints: context.learner.preferences.unsolicitedHints,
    });

    if (!decision.ask) {
      return {
        content: `Not now: ${decision.reason}. Continue without asking.`,
      };
    }

    const outcome = resolveConcept(context.registry, args.conceptTerm, {
      parentHint: args.parentTerm as ConceptId | undefined,
      now: context.clock.now(),
    });

    if (outcome.status === "ambiguous") {
      return {
        content: `Ambiguous concept: ${outcome.candidates
          .map((candidate) => candidate.canonicalName)
          .join(", ")}. Ask the user which one, without mentioning this.`,
      };
    }

    context.registry = outcome.registry;

    context.session.openElicitation = {
      schemaVersion: ELICITATION_SCHEMA_VERSION,
      kind: decision.kind,
      conceptId: outcome.concept.id,
      intentId: args.intentId as IntentId | undefined,
      question: args.question,
      askedAt: context.clock.now().toISOString(),
    };

    context.session.lastElicitedTurn = context.session.turnCount;
    context.session.elicitationsAsked += 1;

    return {
      content: `Ask this and stop: "${args.question}" — leave it easy to skip.`,
    };
  },
};

const RecordArgs = z.object({
  answered: z.boolean(),
  predicted: z.enum(["pass", "fail"]).optional(),
  selfConfidence: z.number().min(0).max(1).optional(),
  summary: z.string().min(1).optional(),
});

export const recordAnswer: Tool<ToolContext> = {
  definition: {
    name: "record_answer",
    description:
      "Record the learner's reply to the open question. Pass answered false when they moved on instead of answering, which is fine and must not be pushed back on.",
    parameters: {
      type: "object",
      properties: {
        answered: { type: "boolean" },
        predicted: {
          type: "string",
          enum: ["pass", "fail"],
          description: "For a prediction: what they expect to happen.",
        },
        selfConfidence: {
          type: "number",
          description:
            "How sure they sounded, 0 to 1, estimated from their wording. Never ask for a number.",
        },
        summary: {
          type: "string",
          description:
            "For prior knowledge or a recap: what they said, in one line.",
        },
      },
      required: ["answered"],
    },
  },

  async execute(rawArgs, context) {
    const args = RecordArgs.parse(rawArgs);
    const open = context.session.openElicitation;

    if (open === null || open === undefined) {
      return { content: "no question is open", isError: true };
    }

    context.session.openElicitation = null;

    if (!args.answered) {
      context.session.consecutiveIgnored += 1;
      return {
        content:
          "Noted. Carry on with what you were doing, without remarking on it.",
      };
    }

    context.session.consecutiveIgnored = 0;

    if (open.kind === "prediction") {
      context.session.pendingPrediction = {
        conceptId: open.conceptId,
        intentId: open.intentId,
        predicted: args.predicted ?? "pass",
        selfConfidence: args.selfConfidence,
        madeAt: context.clock.now().toISOString(),
      };

      return {
        content:
          "Recorded. Run verify now, and open with what they expected against what happened.",
      };
    }

    context.pendingEvidence.push({
      kind: "self_assessment",
      conceptId: open.conceptId,
      provenance: "self_declared",
      confidence: 0.6,
      outcome: "n/a",
      note: args.summary,
    });

    if (open.kind === "recap") {
      return {
        content:
          "Recorded. Compare what they said against what the exercise actually turned on. If it is close but not right, say where — a partial understanding is invisible in a passing test.",
      };
    }

    return {
      content: "Recorded. Start the explanation from what they already know.",
    };
  },
};
