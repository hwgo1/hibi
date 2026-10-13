import type { Clock } from "../ports/storage";
import type { HintStep, Ladder, WorkItem } from "../schemas/session";

/**
 * What the tutor may reveal at each step. The model receives one of these
 * strings as a tool result and writes a answer within that limit
 */
export const STEP_INSTRUCTIONS: Record<HintStep, string> = {
  1: "Point at the region and name the concept involved. Do not state the specific problem and do not write any code.",
  2: "Name the problem precisely and show where it is. Do not write the correction.",
  3: "Show the correction and explain why it works. Then offer a short variation of the same problem, changed in context but not in structure, for the user to try without looking back.",
};

/** Signals available when the first hint is requested */
export interface EntryContext {
  masteryLevel: number | null;
  attempts: number;
}

export function deriveEntryStep(context: EntryContext): HintStep {
  return context.attempts >= 2 || (context.masteryLevel ?? 0) >= 0.6 ? 2 : 1;
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
  item: WorkItem;
  clock: Clock;
}

export type EffortCheck = { met: true } | { met: false; remainingMs: number };

export function effortFloorMet(input: EffortInput): EffortCheck {
  const { item, clock } = input;

  if ((item.ladder?.hintsGiven ?? 0) > 0) return { met: true };
  if (item.attempts >= EFFORT_FLOOR.orAfterAttempts) return { met: true };

  const elapsed = clock.now().getTime() - Date.parse(item.createdAt);
  if (elapsed >= EFFORT_FLOOR.minimumMs) return { met: true };

  return { met: false, remainingMs: EFFORT_FLOOR.minimumMs - elapsed };
}

export interface EscalationInput {
  ladder: Ladder;
  attempts: number;
  /** Set when the user asked to skip ahead */
  userRequested: boolean;
  clock: Clock;
}

export function nextStep(input: EscalationInput): HintStep {
  const { ladder, attempts, userRequested, clock } = input;

  if (userRequested) return 3;
  if (ladder.hintsGiven === 0) return ladder.step;

  const attemptsSinceHint = attempts - ladder.attemptsAtLastHint;
  const stuckLongEnough =
    ladder.lastHintAt !== undefined &&
    clock.now().getTime() - Date.parse(ladder.lastHintAt) >= ESCALATION.stuckMs;

  if (attemptsSinceHint >= ESCALATION.attemptsPerStep || stuckLongEnough) {
    return climb(ladder.step);
  }
  return ladder.step;
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
