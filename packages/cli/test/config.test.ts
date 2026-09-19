import { afterEach, describe, expect, test } from "bun:test";

import { detectLanguage } from "../src/onboarding";

const ORIGINAL = process.env["LANG"];

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env["LANG"];
  else process.env["LANG"] = ORIGINAL;
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
