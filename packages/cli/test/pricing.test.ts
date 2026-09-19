import { describe, expect, test } from "bun:test";

import { addUsage, emptySpend, formatSpend } from "../src/pricing";

describe("pricing", () => {
  test("accumulates tokens and cost across turns", () => {
    let spend = emptySpend();
    spend = addUsage(
      spend,
      { inputTokens: 1000, outputTokens: 500 },
      "gpt-4.1",
    );
    spend = addUsage(
      spend,
      { inputTokens: 1000, outputTokens: 500 },
      "gpt-4.1",
    );

    expect(spend.inputTokens).toBe(2000);
    expect(spend.usd).toBeCloseTo(0.012, 5);
  });

  test("tracks tokens without cost for an unknown model", () => {
    const spend = addUsage(
      emptySpend(),
      { inputTokens: 10, outputTokens: 5 },
      "mystery",
    );
    expect(spend.usd).toBeNull();
    expect(formatSpend(spend)).toBe("15 tokens");
  });
});
