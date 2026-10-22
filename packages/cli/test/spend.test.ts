import { describe, expect, test } from "bun:test";

import { addUsage, emptySpend, formatSpend } from "../src/spend";

const usage = (usd: number | null) => ({
  inputTokens: 1000,
  cachedInputTokens: 400,
  outputTokens: 500,
  usd,
});

describe("addUsage", () => {
  test("adds tokens and the cost the daemon reported", () => {
    const spend = addUsage(addUsage(emptySpend(), usage(0.01)), usage(0.02));

    expect(spend.inputTokens).toBe(2000);
    expect(spend.cachedTokens).toBe(800);
    expect(spend.usd).toBeCloseTo(0.03, 6);
  });

  test("one unpriced completion makes the total unknown", () => {
    const spend = addUsage(addUsage(emptySpend(), usage(0.01)), usage(null));

    expect(spend.usd).toBeNull();
    expect(formatSpend(spend)).not.toContain("$");
  });
});
