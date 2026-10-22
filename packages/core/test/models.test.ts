import { describe, expect, test } from "bun:test";

import { costOf, meetsTutorBaseline, MODEL_CHOICES } from "../src/models";
import { isKnownLanguage, TeachingPreferencesSchema } from "../src/schemas/learner";

describe("costOf", () => {
  test("prices fresh input, cached input and output at their own rates", () => {
    expect(
      costOf({ inputTokens: 1000, outputTokens: 500 }, "gpt-4.1"),
    ).toBeCloseTo(0.006, 6);
  });

  test("cached input costs less than fresh input", () => {
    const fresh = costOf({ inputTokens: 1000, outputTokens: 0 }, "gpt-4.1")!;
    const cached = costOf(
      { inputTokens: 1000, cachedInputTokens: 900, outputTokens: 0 },
      "gpt-4.1",
    )!;
    expect(cached).toBeLessThan(fresh);
  });

  test("a model without a known price costs null, not zero", () => {
    expect(costOf({ inputTokens: 10, outputTokens: 10 }, "some-new-model")).toBeNull();
  });

  test("bills cache writes above fresh input and cache reads far below it", () => {
    const usage = {
      inputTokens: 4000,
      cachedInputTokens: 1000,
      cacheWriteTokens: 2000,
      outputTokens: 100,
    };
    const expected = (1000 * 2 + 1000 * 0.1 + 2000 * 2.5 + 100 * 10) / 1_000_000;

    expect(costOf(usage, "claude-sonnet-5-5")).toBeCloseTo(expected, 9);
  });

  test("a prompt past the long-context threshold is billed at the higher rates", () => {
    const short = costOf({ inputTokens: 100_000, outputTokens: 0 }, "claude-haiku-5-5")!;
    const long = costOf({ inputTokens: 100_001, outputTokens: 0 }, "claude-haiku-5-5")!;

    expect(short).toBeCloseTo(0.01, 9);
    expect(long).toBeCloseTo(100_001 * 0.5 / 1_000_000, 9);
  });
});

describe("meetsTutorBaseline", () => {
  test.each(["claude-sonnet-5-5", "claude-opus-5-5", "gpt-4.1", "gpt-6.1-sol"])(
    "%s keeps to the hint depth",
    (model) => {
      expect(meetsTutorBaseline(model)).toBe(true);
    },
  );

  test.each(["claude-haiku-5-5", "gpt-4.1-mini", "gpt-6-luna", "gpt-5.4-nano"])(
    "%s is flagged as a small tier",
    (model) => {
      expect(meetsTutorBaseline(model)).toBe(false);
    },
  );

  test("every recommended choice meets the baseline", () => {
    for (const choices of Object.values(MODEL_CHOICES)) {
      expect(meetsTutorBaseline(choices[0]!.id)).toBe(true);
    }
  });
});

describe("isKnownLanguage", () => {
  test.each(["pt-BR", "pt", "en", "es", "ja"])("accepts %s", (tag) => {
    expect(isKnownLanguage(tag)).toBe(true);
  });

  test.each(["sim", "yes", "ok", "xx", "pt_BR", "Português", ""])(
    "rejects %s",
    (tag) => {
      expect(isKnownLanguage(tag)).toBe(false);
    },
  );

  test("the language preference refuses a stray word", () => {
    expect(TeachingPreferencesSchema.safeParse({ language: "sim" }).success).toBe(
      false,
    );
  });
});
