import type { SessionState } from "@hibi/core";
import { STALE_INTENT_THRESHOLD_MS } from "@hibi/core";

/**
 * Marks intents left untouched past the threshold. Runs on resume, since the daemon
 * may have been down for the whole interval.
 *
 * Staleness is only a flag: whether the work was finished or dropped is
 * something the log cannot tell, so hibi asks once instead of inferring.
 */
export function sweepStaleIntents(session: SessionState, now: Date): number {
  let marked = 0;
  for (const intent of session.intents) {
    if (intent.status !== "active") continue;
    if (
      now.getTime() - Date.parse(intent.lastTouchedAt) <
      STALE_INTENT_THRESHOLD_MS
    )
      continue;
    intent.status = "stale";
    marked += 1;
  }
  return marked;
}
