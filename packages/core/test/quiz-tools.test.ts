import { describe, expect, test } from "bun:test";

import type { ConceptId } from "../src/concepts";
import { buildToolRegistry, type ToolContext } from "../src/tools";
import { TEST_NOW, testContext } from "./fixtures";

const QUESTIONS = [
  {
    prompt: "When does a buffered channel block on send?",
    options: [
      {
        id: "a",
        text: "Never",
        misconception: "Believing buffering removes blocking entirely",
      },
      { id: "b", text: "When the buffer is full" },
      {
        id: "c",
        text: "On every send",
        misconception: "Confusing buffered with unbuffered",
      },
    ],
    correctOptionId: "b",
    explanation:
      "A buffered channel blocks on send only once the buffer is full.",
  },
];

async function openQuiz(ctx: ToolContext) {
  return buildToolRegistry().execute(
    "ask_quiz",
    {
      conceptTerm: "concurrency",
      parentTerm: "programming-fundamentals",
      questions: QUESTIONS,
    },
    ctx,
  );
}

describe("ask_quiz", () => {
  test("stores the quiz on the session and shows the first question", async () => {
    const ctx = testContext();
    const result = await openQuiz(ctx);

    expect(ctx.session.openQuiz?.questions).toHaveLength(1);
    expect(ctx.session.openQuiz?.cursor).toBe(0);
    expect(result.content).toContain("buffered channel");
  });

  test("never reveals the correct answer when presenting", async () => {
    const ctx = testContext();
    const result = await openQuiz(ctx);

    expect(result.content).toContain("Do not reveal which is correct");
    expect(result.content).not.toContain("correctOptionId");
  });

  test("rejects a question whose correct option does not exist", async () => {
    const ctx = testContext();
    const result = await buildToolRegistry().execute(
      "ask_quiz",
      {
        conceptTerm: "concurrency",
        parentTerm: "programming-fundamentals",
        questions: [{ ...QUESTIONS[0]!, correctOptionId: "z" }],
      },
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(ctx.session.openQuiz).toBeNull();
  });
});

describe("answer_quiz", () => {
  test("records a correct answer as graded evidence", async () => {
    const ctx = testContext();
    await openQuiz(ctx);
    await buildToolRegistry().execute("answer_quiz", { optionId: "b" }, ctx);

    const evidence = ctx.pendingEvidence.at(-1)!;
    expect(evidence.kind).toBe("quiz_answered");
    expect(evidence.provenance).toBe("graded_choice");
    expect(evidence.outcome).toBe("pass");
  });

  test("returns the misconception behind a wrong answer", async () => {
    const ctx = testContext();
    await openQuiz(ctx);
    const result = await buildToolRegistry().execute(
      "answer_quiz",
      { optionId: "c" },
      ctx,
    );

    expect(result.content).toContain("Confusing buffered with unbuffered");
    expect(ctx.pendingEvidence.at(-1)!.outcome).toBe("fail");
  });

  test("records an admitted gap without scoring it as failure", async () => {
    const ctx = testContext();
    await openQuiz(ctx);
    await buildToolRegistry().execute(
      "answer_quiz",
      { response: "unknown" },
      ctx,
    );

    const evidence = ctx.pendingEvidence.at(-1)!;
    expect(evidence.kind).toBe("self_assessment");
    expect(evidence.outcome).toBe("n/a");
  });

  test("closes the quiz once the last question is answered", async () => {
    const ctx = testContext();
    await openQuiz(ctx);
    await buildToolRegistry().execute("answer_quiz", { optionId: "b" }, ctx);

    expect(ctx.session.openQuiz).toBeNull();
  });

  test("errors when no quiz is open", async () => {
    const result = await buildToolRegistry().execute(
      "answer_quiz",
      { optionId: "a" },
      testContext(),
    );
    expect(result.isError).toBe(true);
  });
});

describe("dispute_mastery", () => {
  test("opens a dispute without changing the estimate", async () => {
    const ctx = testContext();
    ctx.learner.mastery.push({
      conceptId: "concurrency" as ConceptId,
      level: 0.2,
      confidence: 0.5,
      directEvidenceCount: 2,
      rolledUpEvidenceCount: 0,
      computedAt: TEST_NOW.toISOString(),
      formulaVersion: 2,
      lastSeenAt: TEST_NOW.toISOString(),
    });

    await buildToolRegistry().execute(
      "dispute_mastery",
      { conceptTerm: "concurrency" },
      ctx,
    );

    expect(ctx.session.disputes).toHaveLength(1);
    expect(ctx.session.disputes[0]!.disputedLevel).toBe(0.2);
    expect(ctx.learner.mastery[0]!.level).toBe(0.2);
  });

  test("warns that a repeated dispute counts for less", async () => {
    const ctx = testContext();
    const registry = buildToolRegistry();

    await registry.execute(
      "dispute_mastery",
      { conceptTerm: "concurrency" },
      ctx,
    );
    const second = await registry.execute(
      "dispute_mastery",
      { conceptTerm: "concurrency" },
      ctx,
    );

    expect(second.content).toContain("disputed before");
  });

  test("a quiz opened after a dispute is linked to it", async () => {
    const ctx = testContext();
    const registry = buildToolRegistry();

    await registry.execute(
      "dispute_mastery",
      { conceptTerm: "concurrency" },
      ctx,
    );
    await openQuiz(ctx);

    expect(ctx.session.openQuiz?.disputeOf).toBe("concurrency" as ConceptId);
  });
});
