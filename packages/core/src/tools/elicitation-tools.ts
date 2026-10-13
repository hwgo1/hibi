import { z } from "zod";

import { shouldElicit } from "../elicitation/policy";
import type { ItemId } from "../ids";
import { ELICITATION_SCHEMA_VERSION } from "../schemas/elicitation";
import { ConceptTermArg, ParentTermArg, resolveTerm } from "./concept-term";
import type { ToolContext } from "./context";
import { findOpenItem } from "./items";
import { defineTool, type Tool } from "./registry";

export const askLearner: Tool<ToolContext> = defineTool({
  name: "ask_learner",
  description:
    "Ask one short, specific question at a break: what the learner already knows before a new concept, what they expect their code to do before running it, or what the exercise came down to after it closes. May decline, in which case continue silently.",
  args: z.object({
    seam: z
      .enum(["before_concept", "before_verify", "after_exercise"])
      .describe("Where in the session this falls."),
    conceptTerm: ConceptTermArg,
    parentTerm: ParentTermArg,
    question: z
      .string()
      .min(1)
      .describe(
        "The question, in the learner's language. Must be specific to their code or the concept at hand, never generic.",
      ),
    itemId: z
      .string()
      .min(1)
      .optional()
      .describe("The exercise this concerns, when there is one."),
  }),

  async execute(args, context: ToolContext) {
    const decision = shouldElicit({
      session: context.session,
      seam: args.seam,
      unsolicitedHints: context.learner.preferences.unsolicitedHints,
    });

    if (!decision.ask) {
      return {
        content: `Not now: ${decision.reason}. Continue without asking.`,
      };
    }

    const item = findOpenItem(context.session, args.itemId);
    if (decision.kind === "prediction" && !item.found) {
      return {
        content: `Not now: ${item.reason}. Continue without asking.`,
      };
    }

    const resolved = resolveTerm(context, args.conceptTerm, args.parentTerm);
    if (!resolved.ok) return resolved.outcome;

    context.session.openElicitation = {
      schemaVersion: ELICITATION_SCHEMA_VERSION,
      kind: decision.kind,
      conceptId: resolved.concept.id,
      itemId: item.found ? item.item.id : (args.itemId as ItemId | undefined),
      question: args.question,
      askedAt: context.clock.now().toISOString(),
    };

    context.session.lastElicitedTurn = context.session.turnCount;
    context.session.elicitationsAsked += 1;

    return {
      content: `Ask this and stop: "${args.question}" — leave it easy to skip.`,
    };
  },
});

export const recordAnswer: Tool<ToolContext> = defineTool({
  name: "record_answer",
  description:
    "Record the learner's reply to the open question. Pass answered false when they moved on instead of answering, which is fine and must not be pushed back on.",
  args: z.object({
    answered: z
      .boolean()
      .describe("False when the learner moved on without answering."),
    predicted: z
      .enum(["pass", "fail"])
      .optional()
      .describe("For a prediction: what they expect to happen."),
    selfConfidence: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe(
        "How sure they sounded, 0 to 1, estimated from their wording. Never ask for a number.",
      ),
    summary: z
      .string()
      .min(1)
      .optional()
      .describe("For prior knowledge or a recap: what they said, in one line."),
  }),

  async execute(args, context: ToolContext) {
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
      const lookup = findOpenItem(context.session, open.itemId);
      if (!lookup.found) {
        return {
          content: `No open exercise to attach the prediction to: ${lookup.reason}.`,
          isError: true,
        };
      }
      lookup.item.prediction = {
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
});
