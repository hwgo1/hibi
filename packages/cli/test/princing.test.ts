import { describe, expect, test } from "bun:test";

import { addUsage, emptySpend, formatSpend } from "../src/pricing";

describe("addUsage", () => {
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
    expect(spend.outputTokens).toBe(1000);
    expect(spend.usd).toBeCloseTo(0.012, 5);
  });

  test("charges cached input at the cached rate", () => {
    const uncached = addUsage(
      emptySpend(),
      { inputTokens: 1000, outputTokens: 0 },
      "gpt-4.1",
    );
    const cached = addUsage(
      emptySpend(),
      { inputTokens: 1000, cachedInputTokens: 900, outputTokens: 0 },
      "gpt-4.1",
    );

    expect(cached.usd!).toBeLessThan(uncached.usd!);
    expect(cached.cachedTokens).toBe(900);
  });

  test("treats a fully cached prompt as cheapest", () => {
    const spend = addUsage(
      emptySpend(),
      { inputTokens: 1000, cachedInputTokens: 1000, outputTokens: 0 },
      "gpt-4.1",
    );

    expect(spend.usd).toBeCloseTo(0.0005, 6);
  });

  test("tracks tokens without cost for an unknown model", () => {
    const spend = addUsage(
      emptySpend(),
      { inputTokens: 10, outputTokens: 5 },
      "mystery",
    );
    expect(spend.usd).toBeNull();
  });

  test("cost stays null once an unpriced model has been used", () => {
    let spend = addUsage(
      emptySpend(),
      { inputTokens: 10, outputTokens: 5 },
      "mystery",
    );
    spend = addUsage(spend, { inputTokens: 10, outputTokens: 5 }, "gpt-4.1");

    expect(spend.usd).toBeNull();
    expect(spend.inputTokens).toBe(20);
  });
});

describe("formatSpend", () => {
  test("reports the cached share", () => {
    const spend = addUsage(
      emptySpend(),
      { inputTokens: 1000, cachedInputTokens: 800, outputTokens: 0 },
      "gpt-4.1",
    );

    expect(formatSpend(spend)).toContain("80% cached");
  });

  test("omits the cached share when nothing was cached", () => {
    const spend = addUsage(
      emptySpend(),
      { inputTokens: 100, outputTokens: 50 },
      "gpt-4.1",
    );
    expect(formatSpend(spend)).not.toContain("cached");
  });

  test("shows tokens without a price for an unknown model", () => {
    const spend = addUsage(
      emptySpend(),
      { inputTokens: 10, outputTokens: 5 },
      "mystery",
    );

    expect(formatSpend(spend)).toContain("15 tokens");
    expect(formatSpend(spend)).not.toContain("$");
  });
});
