import type { ElicitationKind } from "../schemas/elicitation";
import type { SessionState } from "../schemas/session";

/** Points in a session where a question does not interrupt */
export const ELICITATION_SEAMS = [
  "before_concept",
  "before_verify",
  "after_exercise",
] as const;

export type ElicitationSeam = (typeof ELICITATION_SEAMS)[number];

const SEAM_KINDS: Record<ElicitationSeam, ElicitationKind> = {
  before_concept: "prior_knowledge",
  before_verify: "prediction",
  after_exercise: "recap",
};

export const ELICITATION_LIMITS = {
  minTurnsBetween: 4,
  maxPerSession: 6,
  /** Consecutive unanswered questions before the tutor stops asking */
  ignoredBeforeBackoff: 2,
} as const;

export interface ElicitationContext {
  session: SessionState;
  seam: ElicitationSeam;
  /** From the learner's declared preferences */
  unsolicitedHints: "never" | "when-stuck" | "proactive";
}

export type ElicitationDecision =
  | { ask: true; kind: ElicitationKind }
  | { ask: false; reason: string };

/** Decides whether to ask at this point */
export function shouldElicit(context: ElicitationContext): ElicitationDecision {
  const { session } = context;

  if (context.unsolicitedHints === "never") {
    return { ask: false, reason: "learner declined unsolicited prompts" };
  }

  if (session.openElicitation !== null) {
    return { ask: false, reason: "one is already open" };
  }

  if (session.openQuiz !== null) {
    return { ask: false, reason: "a quiz is open" };
  }

  if (session.consecutiveIgnored >= ELICITATION_LIMITS.ignoredBeforeBackoff) {
    return { ask: false, reason: "the learner has been ignoring these" };
  }

  if (session.elicitationsAsked >= ELICITATION_LIMITS.maxPerSession) {
    return { ask: false, reason: "session limit reached" };
  }

  const since =
    session.lastElicitedTurn === null
      ? Number.POSITIVE_INFINITY
      : session.turnCount - session.lastElicitedTurn;

  if (since < ELICITATION_LIMITS.minTurnsBetween) {
    return { ask: false, reason: "asked too recently" };
  }

  return { ask: true, kind: SEAM_KINDS[context.seam] };
}
