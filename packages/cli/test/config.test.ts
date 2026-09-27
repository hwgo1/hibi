import { afterEach, describe, expect, test } from "bun:test";

import { CredentialsSchema, ProviderIdSchema } from "../src/config";
import { detectLanguage } from "../src/onboarding";

const ORIGINAL_LANG = process.env["LANG"];

afterEach(() => {
  if (ORIGINAL_LANG === undefined) delete process.env["LANG"];
  else process.env["LANG"] = ORIGINAL_LANG;
});

describe("credential schemas", () => {
  test("accepts a complete entry", () => {
    const parsed = CredentialsSchema.safeParse({
      provider: "openai",
      apiKey: "sk-test",
      model: "gpt-4.1",
    });

    expect(parsed.success).toBe(true);
  });

  test("rejects an empty key", () => {
    const parsed = CredentialsSchema.safeParse({
      provider: "openai",
      apiKey: "",
      model: "gpt-4.1",
    });

    expect(parsed.success).toBe(false);
  });

  test("rejects an unknown provider", () => {
    expect(ProviderIdSchema.safeParse("gemini").success).toBe(false);
  });
});

describe("detectLanguage", () => {
  test("reads a BCP-47 tag from the locale environment", () => {
    process.env["LANG"] = "pt_BR.UTF-8";
    expect(detectLanguage()).toBe("pt-BR");
  });

  test("falls back to the runtime locale", () => {
    delete process.env["LANG"];
    expect(detectLanguage().length).toBeGreaterThanOrEqual(2);
  });
});
