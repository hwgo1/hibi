import { describe, expect, test } from "bun:test";

import {
  newSessionState,
  STALE_INTENT_THRESHOLD_MS,
  type ConceptId,
  type IntentId,
  type SessionId,
  type UserId,
} from "@hibi/core";

import { sweepStaleIntents } from "../src/staleness";

const NOW = new Date("2026-01-10T12:00:00.000Z");

function sessionWith(lastTouchedAt: string) {
  const session = newSessionState(
    "s1" as SessionId,
    "local" as UserId,
    "/tmp/repo",
    NOW,
  );
  session.intents.push({
    id: "int_1" as IntentId,
    kind: "explain",
    conceptId: "concurrency" as ConceptId,
    createdAt: lastTouchedAt,
    lastTouchedAt,
    status: "active",
  });
  return session;
}

describe("sweepStaleIntents", () => {
  test("marks an intent past the threshold", () => {
    const old = new Date(
      NOW.getTime() - STALE_INTENT_THRESHOLD_MS - 1000,
    ).toISOString();
    const session = sessionWith(old);

    expect(sweepStaleIntents(session, NOW)).toBe(1);
    expect(session.intents[0]!.status).toBe("stale");
  });

  test("leaves a recent intent alone", () => {
    const recent = new Date(NOW.getTime() - 60_000).toISOString();
    const session = sessionWith(recent);

    expect(sweepStaleIntents(session, NOW)).toBe(0);
    expect(session.intents[0]!.status).toBe("active");
  });
});
