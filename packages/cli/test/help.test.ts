import { describe, expect, test } from "bun:test";

import { helpFor } from "../src/help";

const LANGUAGES = ["en", "pt", "es"];

function allCommands(language: string): string[] {
  return helpFor(language)
    .sections.flatMap((section) =>
      section.commands.map((entry) => entry.command),
    )
    .sort();
}

describe("helpFor", () => {
  test("every language lists the same commands", () => {
    const reference = allCommands("en");

    for (const language of LANGUAGES) {
      expect(allCommands(language)).toEqual(reference);
    }
  });

  test("the short help only shows commands that exist in the full list", () => {
    for (const language of LANGUAGES) {
      const full = new Set(allCommands(language));
      for (const entry of helpFor(language).essentials) {
        expect(full.has(entry.command)).toBe(true);
      }
    }
  });

  test("offers examples of what to type in every language", () => {
    for (const language of LANGUAGES) {
      expect(helpFor(language).examples.length).toBeGreaterThan(0);
    }
  });

  test("every command starts with a slash", () => {
    for (const command of allCommands("en")) {
      expect(command.startsWith("/")).toBe(true);
    }
  });

  test("falls back to English", () => {
    expect(helpFor("ja").intro).toBe(helpFor("en").intro);
  });

  test("resolves a regional tag to its language", () => {
    expect(helpFor("pt-BR").intro).toBe(helpFor("pt").intro);
  });
});
