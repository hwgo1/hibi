import { describe, expect, test } from "bun:test";

import { catalogFor, fill } from "../src/i18n";

describe("catalogFor", () => {
  test("matches by primary subtag", () => {
    expect(catalogFor("pt-BR").greeting).toBe(catalogFor("pt-PT").greeting);
  });

  test("is case-insensitive", () => {
    expect(catalogFor("PT-br").greeting).toBe(catalogFor("pt").greeting);
  });

  test("falls back to English for an unknown language", () => {
    expect(catalogFor("ja").greeting).toBe(catalogFor("en").greeting);
  });

  test("every catalog defines every key", () => {
    const keys = Object.keys(catalogFor("en")).sort();

    for (const language of ["pt", "es"]) {
      expect(Object.keys(catalogFor(language)).sort()).toEqual(keys);
    }
  });

  test("the confirmation word is the same in every language", () => {
    for (const language of ["en", "pt", "es"]) {
      expect(catalogFor(language).forgetWarning).toContain(
        "/forget all forget",
      );
    }
  });

  test("the loader says thinking in the learner's language", () => {
    expect(catalogFor("pt-BR").thinking).toBe("pensando");
  });
});

describe("fill", () => {
  test("replaces a placeholder", () => {
    expect(fill("Oi, {name}.", { name: "Hugo" })).toBe("Oi, Hugo.");
  });

  test("leaves an unknown placeholder as written", () => {
    expect(fill("dica {step} de 3", {})).toBe("dica {step} de 3");
  });

  test("replaces every occurrence", () => {
    expect(fill("{a} e {a}", { a: "x" })).toBe("x e x");
  });
});
