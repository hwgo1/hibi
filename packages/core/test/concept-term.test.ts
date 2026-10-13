import { describe, expect, test } from "bun:test";

import type { ConceptId } from "../src/concepts";
import { validateConceptTerm } from "../src/concept-resolver";
import { resolveTerm } from "../src/tools/concept-term";
import { TEST_NOW, testContext } from "./fixtures";

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

describe("resolveTerm", () => {
  test("finds an existing concept whatever its case", () => {
    const resolved = resolveTerm(testContext(), "Concurrency");

    expect(resolved.ok && resolved.concept.id).toBe("concurrency" as ConceptId);
  });

  test("normalizes the parent term like any other", () => {
    const context = testContext();
    const resolved = resolveTerm(
      context,
      "goroutines",
      "Programming Fundamentals",
    );

    expect(resolved.ok && resolved.concept.parentId).toBe(
      "programming-fundamentals" as ConceptId,
    );
  });

  test("stores a new concept on the context", () => {
    const context = testContext();
    const before = context.registry.concepts.length;

    resolveTerm(context, "goroutines");

    expect(context.registry.concepts).toHaveLength(before + 1);
  });

  test("an ambiguous term goes back to the model with the candidates", () => {
    const context = testContext();
    context.registry.concepts.push(
      {
        id: "hash-map" as ConceptId,
        canonicalName: "hash map",
        aliases: [],
        parentId: null,
        source: "proposed",
        createdAt: TEST_NOW.toISOString(),
      },
      {
        id: "hash-set" as ConceptId,
        canonicalName: "hash set",
        aliases: [],
        parentId: null,
        source: "proposed",
        createdAt: TEST_NOW.toISOString(),
      },
    );
    const before = context.registry.concepts.length;

    const resolved = resolveTerm(context, "hash mapping");

    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.outcome.isError).toBe(true);
    expect(resolved.outcome.content).toContain("hash-map");
    expect(resolved.outcome.content).toContain("Do not ask the user");
    expect(context.registry.concepts).toHaveLength(before);
  });

  test("a question is refused before anything is resolved", () => {
    const resolved = resolveTerm(testContext(), "what is a mutex");

    expect(resolved.ok).toBe(false);
  });
});
