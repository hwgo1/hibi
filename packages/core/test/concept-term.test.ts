import { describe, expect, test } from "bun:test";

import { validateConceptTerm } from "../src/concept-resolver";

describe("validateConceptTerm", () => {
  test("accepts a short topic", () => {
    expect(validateConceptTerm("linked list")).toBeNull();
    expect(validateConceptTerm("daemon process")).toBeNull();
  });

  test("rejects a sentence", () => {
    expect(
      validateConceptTerm("how a program becomes a daemon"),
    ).not.toBeNull();
  });

  test("rejects a question prefix", () => {
    expect(validateConceptTerm("what is a mutex")).not.toBeNull();
  });

  test("rejects a question mark", () => {
    expect(validateConceptTerm("mutex?")).not.toBeNull();
  });

  test("rejects an empty term", () => {
    expect(validateConceptTerm("   ")).not.toBeNull();
  });
});
