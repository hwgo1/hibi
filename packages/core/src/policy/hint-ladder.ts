import type { Clock } from "../ports/storage";
import type { HintStep, ResolveIntent } from "../schemas/session";

/**
 * What the tutor may reveal at each step. The model receives one of these
 * strings as a tool result and writes a answer within that limit
 */
export const STEP_INSTRUCTIONS: Record<HintStep, string> = {
  1: "Point at the region and name the concept involved. Do not state the specific problem and do not write any code.",
  2: "Name the problem precisely and show where it is. Do not write the correction.",
  3: "Show the correction and explain why it works. Then offer a short variation of the same problem, changed in context but not in structure, for the user to try without looking back.",
};

/** Signals available when a resolve intent is first created */
export interface EntryContext {
  hasExistingCode: boolean;
  questionIsSpecific: boolean;
  masteryLevel: number | null;
  selfReportedAttempts: number;
}

export function deriveEntryStep(context: EntryContext): HintStep {
  if (!context.hasExistingCode) return 1;

  let score = 0;
  if (context.questionIsSpecific) score += 2;
  if (context.selfReportedAttempts >= 2) score += 1;
  if ((context.masteryLevel ?? 0) >= 0.6) score += 1;

  return score >= 3 ? 2 : 1;
}

export const ESCALATION = {
  attemptsPerStep: 2,
  stuckMs: 8 * 60 * 1000,
} as const;

/**
 * Minimum real effort before the first hint. A hint received before the
 * learner has engaged does not stick, and without a floor the ladder degrades
 * into autocomplete with extra steps
 */
export const EFFORT_FLOOR = {
  minimumMs: 3 * 60 * 1000,
  orAfterAttempts: 1,
} as const;

export interface EffortInput {
  intent: ResolveIntent;
  clock: Clock;
}

export type EffortCheck = { met: true } | { met: false; remainingMs: number };

export function effortFloorMet(input: EffortInput): EffortCheck {
  const { intent, clock } = input;

  if (intent.hintsGiven > 0) return { met: true };
  if (intent.attempts >= EFFORT_FLOOR.orAfterAttempts) return { met: true };

  const elapsed = clock.now().getTime() - Date.parse(intent.createdAt);
  if (elapsed >= EFFORT_FLOOR.minimumMs) return { met: true };

  return { met: false, remainingMs: EFFORT_FLOOR.minimumMs - elapsed };
}

export interface EscalationInput {
  intent: ResolveIntent;
  /** Set when the user asked to skip ahead */
  userRequested: boolean;
  clock: Clock;
}

export function nextStep(input: EscalationInput): HintStep {
  const { intent, userRequested, clock } = input;

  if (userRequested) return 3;
  if (intent.hintsGiven === 0) return intent.step;

  const attemptsSinceHint = intent.attempts - intent.attemptsAtLastHint;
  const stuckLongEnough =
    intent.lastHintAt !== undefined &&
    clock.now().getTime() - Date.parse(intent.lastHintAt) >= ESCALATION.stuckMs;

  if (attemptsSinceHint >= ESCALATION.attemptsPerStep || stuckLongEnough) {
    return climb(intent.step);
  }
  return intent.step;
}

function climb(step: HintStep): HintStep {
  return step === 1 ? 2 : 3;
}

/**
 * Mastery credit multiplier for solving at a given depth. Solving unaided is
 * worth full credit; solving after being shown the correction is worth
 * little, and forced disclosure less still.
 */
export function creditMultiplier(
  step: HintStep,
  forcedDisclosure: boolean,
): number {
  const base = step === 1 ? 1 : step === 2 ? 0.7 : 0.35;
  return forcedDisclosure ? base * 0.5 : base;
}
