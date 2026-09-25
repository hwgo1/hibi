import { describe, expect, test } from "bun:test";

import { catalogFor } from "../src/i18n";

describe("catalogFor", () => {
  test("matches by primary subtag", () => {
    expect(catalogFor("pt-BR").opening).toBe(catalogFor("pt-PT").opening);
  });

  test("is case-insensitive", () => {
    expect(catalogFor("PT-br").opening).toBe(catalogFor("pt").opening);
  });

  test("falls back to English for an unknown language", () => {
    expect(catalogFor("ja").opening).toBe(catalogFor("en").opening);
  });

  test("every catalog defines every key", () => {
    const keys = Object.keys(catalogFor("en"));
    for (const language of ["pt", "es"]) {
      expect(Object.keys(catalogFor(language)).sort()).toEqual(keys.sort());
    }
  });
});
