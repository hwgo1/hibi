import type { SessionState } from "../schemas/session";

/** A gap this long starts a new session: counters reset and anything pending expires */
export const SESSION_IDLE_MS = 2 * 60 * 60 * 1000;

/** Closed items kept after a new session starts; their evidence is in the log either way */
const CLOSED_ITEMS_KEPT = 10;

export function isIdle(session: SessionState, now: Date): boolean {
  return (
    session.turnCount > 0 &&
    now.getTime() - Date.parse(session.updatedAt) >= SESSION_IDLE_MS
  );
}

/**
 * Starts a new session on the same repository. Open exercises carry over;
 * pacing counters, the pending quiz or question and pinned files do not
 */
export function renewSession(session: SessionState): SessionState {
  const open = session.items.filter((item) => item.status === "active");
  const closed = session.items
    .filter((item) => item.status !== "active")
    .slice(-CLOSED_ITEMS_KEPT);

  return {
    ...session,
    items: session.items.filter(
      (item) => open.includes(item) || closed.includes(item),
    ),
    contextFiles: [],
    pending: null,
    lastElicitedTurn: null,
    elicitationsAsked: 0,
    consecutiveIgnored: 0,
  };
}
