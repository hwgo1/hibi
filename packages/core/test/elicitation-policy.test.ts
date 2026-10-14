import { describe, expect, test } from "bun:test";

import { ELICITATION_LIMITS, shouldElicit } from "../src/elicitation/policy";
import { TEST_NOW, testSession } from "./fixtures";

function context(overrides: Partial<Parameters<typeof shouldElicit>[0]> = {}) {
  return {
    session: testSession(),
    seam: "before_verify" as const,
    unsolicitedHints: "when-stuck" as const,
    ...overrides,
  };
}

describe("shouldElicit", () => {
  test("asks at a seam when nothing blocks it", () => {
    const decision = shouldElicit(context());

    expect(decision.ask).toBe(true);
    if (!decision.ask) return;
    expect(decision.kind).toBe("prediction");
  });

  test("matches the kind to the seam", () => {
    const before = shouldElicit(context({ seam: "before_concept" }));
    const after = shouldElicit(context({ seam: "after_exercise" }));

    expect(before.ask && before.kind).toBe("prior_knowledge");
    expect(after.ask && after.kind).toBe("recap");
  });

  test("never asks when the learner declined unsolicited prompts", () => {
    expect(shouldElicit(context({ unsolicitedHints: "never" })).ask).toBe(
      false,
    );
  });

  test("does not open a second question over an open one", () => {
    const session = testSession();
    session.pending = {
      type: "question",
      schemaVersion: 1,
      kind: "recap",
      conceptId: "concurrency" as never,
      question: "e aí?",
      askedAt: TEST_NOW.toISOString(),
    };

    expect(shouldElicit(context({ session })).ask).toBe(false);
  });

  test("stops asking after the learner ignores two in a row", () => {
    const session = testSession();
    session.turnCount = 6;
    session.lastElicitedTurn = 6;
    session.consecutiveIgnored = ELICITATION_LIMITS.ignoredBeforeBackoff;

    expect(shouldElicit(context({ session })).ask).toBe(false);
  });

  test("an ignored streak stops counting once enough turns pass", () => {
    const session = testSession();
    session.lastElicitedTurn = 6;
    session.turnCount = 6 + ELICITATION_LIMITS.backoffTurns;
    session.consecutiveIgnored = ELICITATION_LIMITS.ignoredBeforeBackoff;

    expect(shouldElicit(context({ session })).ask).toBe(true);
  });

  test("does not ask while a quiz is waiting", () => {
    const session = testSession();
    session.pending = {
      type: "quiz",
      schemaVersion: 1,
      questions: [],
      cursor: 0,
      askedAt: TEST_NOW.toISOString(),
    };

    const decision = shouldElicit(context({ session }));
    expect(decision.ask).toBe(false);
    expect(!decision.ask && decision.reason).toContain("quiz");
  });

  test("respects the gap between questions", () => {
    const session = testSession();
    session.turnCount = 5;
    session.lastElicitedTurn = 4;

    expect(shouldElicit(context({ session })).ask).toBe(false);
  });

  test("asks again once enough turns have passed", () => {
    const session = testSession();
    session.turnCount = 10;
    session.lastElicitedTurn = 4;

    expect(shouldElicit(context({ session })).ask).toBe(true);
  });

  test("stops at the session limit", () => {
    const session = testSession();
    session.elicitationsAsked = ELICITATION_LIMITS.maxPerSession;

    expect(shouldElicit(context({ session })).ask).toBe(false);
  });
});
