import { z } from "zod";

import type { Concept } from "../concepts";
import { resolveConcept, validateConceptTerm } from "../concept-resolver";
import type { ToolContext } from "./context";
import type { ToolOutcome } from "./registry";

export const ConceptTermArg = z
  .string()
  .min(1)
  .describe(
    "The topic in English, at most four words. Never a question or a sentence.",
  );

export const ParentTermArg = z
  .string()
  .min(1)
  .optional()
  .describe("A broader concept that already exists in the registry.");

export type TermResolution =
  | { ok: true; concept: Concept }
  | { ok: false; outcome: ToolOutcome };

/**
 * The one place tools turn a term into a concept. Stores the updated registry on
 * the context; an ambiguous term goes back to the model, never to the learner
 */
export function resolveTerm(
  context: ToolContext,
  term: string,
  parentTerm?: string,
): TermResolution {
  const problem = validateConceptTerm(term);
  if (problem !== null) {
    return {
      ok: false,
      outcome: { content: `Not a concept: ${problem}`, isError: true },
    };
  }

  const outcome = resolveConcept(context.registry, term, {
    parentTerm,
    now: context.clock.now(),
  });

  if (outcome.status === "ambiguous") {
    const candidates = outcome.candidates.map((concept) => concept.id);
    return {
      ok: false,
      outcome: {
        content: `"${term}" is close to: ${candidates.join(", ")}. Call again with the one you meant as conceptTerm, or with a more specific term if none fits. Do not ask the user.`,
        isError: true,
      },
    };
  }

  context.registry = outcome.registry;
  return { ok: true, concept: outcome.concept };
}
