import type {
  ExerciseIntent,
  Intent,
  ResolveIntent,
  SessionState,
} from "../schemas/session";

export interface AttemptTarget {
  exercise: ExerciseIntent;
  ladder: ResolveIntent | undefined;
}

export type TargetLookup =
  | { found: true; target: AttemptTarget }
  | { found: false; reason: string };

/** Shared by verify and record_attempt. Accepts an exercise id or its ladder id; refuses closed exercises */
export function findAttemptTarget(
  session: SessionState,
  intentId?: string,
): TargetLookup {
  const id = intentId ?? session.activeIntentId;
  if (id === null) return { found: false, reason: "no exercise is open" };

  const intent = session.intents.find((candidate) => candidate.id === id);
  if (intent === undefined) {
    return { found: false, reason: `unknown intent: ${id}` };
  }

  const exercise = exerciseOf(session, intent);
  if (exercise === undefined) {
    return { found: false, reason: `${id} does not point to an exercise` };
  }
  if (exercise.status === "done" || exercise.status === "abandoned") {
    return {
      found: false,
      reason: `${exercise.id} is ${exercise.status}; propose a new exercise to keep practicing`,
    };
  }

  const ladder =
    intent.kind === "resolve" && intent.status === "active"
      ? intent
      : activeLadder(session, exercise.id);

  return { found: true, target: { exercise, ladder } };
}

function exerciseOf(
  session: SessionState,
  intent: Intent,
): ExerciseIntent | undefined {
  if (intent.kind === "exercise") return intent;
  if (intent.kind !== "resolve" || intent.target.type !== "exercise") {
    return undefined;
  }

  const exerciseId = intent.target.intentId;
  return session.intents.find(
    (candidate): candidate is ExerciseIntent =>
      candidate.kind === "exercise" && candidate.id === exerciseId,
  );
}

function activeLadder(
  session: SessionState,
  exerciseId: string,
): ResolveIntent | undefined {
  return session.intents.find(
    (intent): intent is ResolveIntent =>
      intent.kind === "resolve" &&
      intent.status === "active" &&
      intent.target.type === "exercise" &&
      intent.target.intentId === exerciseId,
  );
}
