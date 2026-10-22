import { afterEach, describe, expect, test } from "bun:test";

import type { RequestBody, ServerEvent } from "@hibi/daemon";

import type { DaemonClient } from "../src/client";
import { chosenLanguage, detectLanguage, runOnboarding } from "../src/onboarding";

const ORIGINAL_LANG = process.env["LANG"];

afterEach(() => {
  if (ORIGINAL_LANG === undefined) delete process.env["LANG"];
  else process.env["LANG"] = ORIGINAL_LANG;
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

describe("chosenLanguage", () => {
  test.each(["", "sim", "Sim", "si", "sí", "yes", "ok"])(
    "%p confirms the detected language",
    (answer) => {
      expect(chosenLanguage(answer, "pt-BR")).toBe("pt-BR");
    },
  );

  test("a language tag replaces the detected one", () => {
    expect(chosenLanguage(" en ", "pt-BR")).toBe("en");
  });

  test("anything else is asked again", () => {
    expect(chosenLanguage("banana", "pt-BR")).toBeNull();
  });
});

describe("runOnboarding", () => {
  test("saves the profile, then retries the key until the daemon accepts one", async () => {
    const answers = ["sim", "Hugo", "2", "sk-bad", "1", "sk-good"];
    const sent: RequestBody[] = [];
    const client = {
      async call(body: RequestBody): Promise<ServerEvent[]> {
        sent.push(body);
        const refused = body.type === "set_key" && body.apiKey === "sk-bad";
        return refused
          ? [{ type: "error", message: "401 invalid x-api-key", requestId: "r" }]
          : [{ type: "ok", message: "saved", requestId: "r" }];
      },
    } as unknown as DaemonClient;

    const write = process.stdout.write;
    process.stdout.write = (() => true) as typeof process.stdout.write;
    process.env["LANG"] = "pt_BR.UTF-8";

    const language = await runOnboarding(
      async () => answers.shift()!,
      client,
      {
        profile: null,
        provider: null,
        model: null,
        storedProviders: [],
        meetsTutorBaseline: false,
      },
    ).finally(() => {
      process.stdout.write = write;
    });

    expect(language).toBe("pt-BR");
    expect(sent).toEqual([
      { type: "set_profile", language: "pt-BR", name: "Hugo" },
      { type: "set_key", provider: "anthropic", apiKey: "sk-bad" },
      { type: "set_key", provider: "openai", apiKey: "sk-good" },
    ]);
  });
});
