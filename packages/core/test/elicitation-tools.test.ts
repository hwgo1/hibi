import { describe, expect, test } from "bun:test";

import { buildToolRegistry, type ToolContext } from "../src/tools";
import { testContext } from "./fixtures";

interface ToolOutcome {
  content: string;
  isError?: boolean;
}

async function ask(
  ctx: ToolContext,
  seam = "before_verify",
): Promise<ToolOutcome> {
  return buildToolRegistry().execute(
    "ask_learner",
    {
      seam,
      conceptTerm: "concurrency",
      parentTerm: "programming-fundamentals",
      question:
        "O teste abre três consumidores. O que acontece com os canais de saída?",
    },
    ctx,
  );
}

/** Opens a question and fails loudly if the tool declined, so a policy
 *  refusal cannot masquerade as a broken assertion further down. */
async function askOrFail(
  ctx: ToolContext,
  seam = "before_verify",
): Promise<void> {
  const result = await ask(ctx, seam);

  if (ctx.session.openElicitation === null) {
    throw new Error(`ask_learner did not open a question: ${result.content}`);
  }
}

describe("ask_learner", () => {
  test("opens a question and tells the tutor to stop", async () => {
    const ctx = testContext();
    const result = await ask(ctx);

    expect(ctx.session.openElicitation?.kind).toBe("prediction");
    expect(result.content).toContain("stop");
  });

  test("records when it asked, for pacing", async () => {
    const ctx = testContext();
    ctx.session.turnCount = 7;

    await askOrFail(ctx);

    expect(ctx.session.lastElicitedTurn).toBe(7);
    expect(ctx.session.elicitationsAsked).toBe(1);
  });

  test("declines without erroring when one is already open", async () => {
    const ctx = testContext();
    await askOrFail(ctx);

    const second = await ask(ctx);

    expect(second.isError).toBeUndefined();
    expect(second.content).toContain("Not now");
  });

  test("declines when the learner turned off unsolicited prompts", async () => {
    const ctx = testContext();
    ctx.learner = {
      ...ctx.learner,
      preferences: { ...ctx.learner.preferences, unsolicitedHints: "never" },
    };

    const result = await ask(ctx);

    expect(result.content).toContain("Not now");
    expect(ctx.session.openElicitation).toBeNull();
  });

  test("rejects a concept term that is a question", async () => {
    const ctx = testContext();
    const result = await buildToolRegistry().execute(
      "ask_learner",
      {
        seam: "before_verify",
        conceptTerm: "what happens when a channel closes",
        parentTerm: "programming-fundamentals",
        question: "e aí?",
      },
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(ctx.session.openElicitation).toBeNull();
  });
});

describe("record_answer", () => {
  test("holds a prediction rather than writing it immediately", async () => {
    const ctx = testContext();
    await askOrFail(ctx);

    await buildToolRegistry().execute(
      "record_answer",
      { answered: true, predicted: "pass", selfConfidence: 0.8 },
      ctx,
    );

    expect(ctx.session.openElicitation).toBeNull();
    expect(ctx.session.pendingPrediction?.predicted).toBe("pass");
    expect(ctx.session.pendingPrediction?.selfConfidence).toBe(0.8);
    expect(ctx.pendingEvidence).toHaveLength(0);
  });

  test("counts an unanswered question and lets the tutor move on", async () => {
    const ctx = testContext();
    await askOrFail(ctx);

    const result = await buildToolRegistry().execute(
      "record_answer",
      { answered: false },
      ctx,
    );

    expect(ctx.session.consecutiveIgnored).toBe(1);
    expect(ctx.session.openElicitation).toBeNull();
    expect(result.isError).toBeUndefined();
  });

  test("resets the ignored count once the learner answers", async () => {
    const ctx = testContext();
    ctx.session.consecutiveIgnored = 1;

    await askOrFail(ctx, "after_exercise");

    await buildToolRegistry().execute(
      "record_answer",
      { answered: true, summary: "fechava o canal dentro do loop" },
      ctx,
    );

    expect(ctx.session.consecutiveIgnored).toBe(0);
    expect(ctx.pendingEvidence.at(-1)?.kind).toBe("self_assessment");
    expect(ctx.pendingEvidence.at(-1)?.provenance).toBe("self_declared");
  });

  test("errors when nothing is open", async () => {
    const result = await buildToolRegistry().execute(
      "record_answer",
      { answered: true },
      testContext(),
    );

    expect(result.isError).toBe(true);
  });
});
