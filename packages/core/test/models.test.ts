import { describe, expect, test } from "bun:test";

import { costOf } from "../src/models";
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
