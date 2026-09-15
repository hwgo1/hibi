import { describe, expect, test } from "bun:test";

import {
  seedRegistry,
  type ConceptId,
  type ConceptRegistry,
} from "../src/concepts";
import {
  ancestors,
  canonical,
  depth,
  normalizeTerm,
  resolveConcept,
} from "../src/concept-resolver";

const NOW = new Date("2026-01-01T00:00:00.000Z");

function withConcepts(extra: ConceptRegistry["concepts"]): ConceptRegistry {
  const base = seedRegistry(NOW);
  return { ...base, concepts: [...base.concepts, ...extra] };
}

function concept(
  id: string,
  overrides: Partial<ConceptRegistry["concepts"][number]> = {},
): ConceptRegistry["concepts"][number] {
  return {
    id: id as ConceptId,
    canonicalName: id,
    aliases: [],
    parentId: null,
    source: "proposed",
    createdAt: NOW.toISOString(),
    mergedInto: null,
    ...overrides,
  };
}

describe("normalizeTerm", () => {
  test("strips accents, case and punctuation into a slug", () => {
    expect(normalizeTerm("Listas Encadeadas!")).toBe("listas-encadeadas");
    expect(normalizeTerm("listas  encadeadas")).toBe("listas-encadeadas");
    expect(normalizeTerm("listas_encadeadas")).toBe("listas-encadeadas");
  });

  test("collapses composed and decomposed unicode to the same key", () => {
    expect(normalizeTerm("funções")).toBe(normalizeTerm("func\u0327o\u0303es"));
  });
});

describe("resolveConcept", () => {
  test("matches an existing id exactly", () => {
    const registry = seedRegistry(NOW);
    const result = resolveConcept(registry, "concurrency", { now: NOW });
    expect(result.status).toBe("matched");
  });

  test("matches a spelling variant and records it as an alias", () => {
    const registry = withConcepts([concept("linked-list")]);
    const result = resolveConcept(registry, "linked lists", { now: NOW });

    expect(result.status).toBe("matched");
    if (result.status !== "matched") return;
    expect(result.concept.id).toBe("linked-list" as ConceptId);
    expect(result.concept.aliases).toContain("linked-lists");
  });

  test("a recorded alias resolves on the exact path next time", () => {
    const registry = withConcepts([
      concept("linked-list", { aliases: ["listas-encadeadas"] }),
    ]);
    const result = resolveConcept(registry, "Listas Encadeadas", { now: NOW });

    expect(result.status).toBe("matched");
    if (result.status !== "matched") return;
    expect(result.concept.id).toBe("linked-list" as ConceptId);
  });

  test("creates an unrelated term under the suggested parent", () => {
    const registry = seedRegistry(NOW);
    const result = resolveConcept(registry, "goroutines", {
      parentHint: "concurrency" as ConceptId,
      now: NOW,
    });

    expect(result.status).toBe("created");
    if (result.status !== "created") return;
    expect(result.concept.id).toBe("goroutines" as ConceptId);
    expect(result.concept.parentId).toBe("concurrency" as ConceptId);
    expect(result.registry.concepts).toHaveLength(registry.concepts.length + 1);
  });

  test("never mutates the registry it was given", () => {
    const registry = seedRegistry(NOW);
    const before = registry.concepts.length;
    resolveConcept(registry, "goroutines", { now: NOW });
    expect(registry.concepts).toHaveLength(before);
  });

  test("ignores merged concepts when matching", () => {
    const registry = withConcepts([
      concept("hashmap", { mergedInto: "hash-table" as ConceptId }),
      concept("hash-table"),
    ]);
    const result = resolveConcept(registry, "hashmap", { now: NOW });

    expect(result.status).not.toBe("matched");
  });
});

describe("canonical", () => {
  test("follows a chain of merges to the survivor", () => {
    const registry = withConcepts([
      concept("a", { mergedInto: "b" as ConceptId }),
      concept("b", { mergedInto: "c" as ConceptId }),
      concept("c"),
    ]);
    expect(canonical(registry, "a" as ConceptId)?.id).toBe("c" as ConceptId);
  });

  test("terminates on a merge cycle instead of looping forever", () => {
    const registry = withConcepts([
      concept("a", { mergedInto: "b" as ConceptId }),
      concept("b", { mergedInto: "a" as ConceptId }),
    ]);
    expect(canonical(registry, "a" as ConceptId)).not.toBeNull();
  });

  test("returns null for an unknown id", () => {
    expect(canonical(seedRegistry(NOW), "nope" as ConceptId)).toBeNull();
  });
});

describe("ancestors", () => {
  test("returns the chain nearest first", () => {
    const registry = withConcepts([
      concept("goroutines", { parentId: "concurrency" as ConceptId }),
    ]);
    const chain = ancestors(registry, "goroutines" as ConceptId).map(
      (c) => c.id,
    );
    expect(chain).toEqual([
      "concurrency",
      "programming-fundamentals",
    ] as ConceptId[]);
  });

  test("returns empty for a root", () => {
    expect(ancestors(seedRegistry(NOW), "backend" as ConceptId)).toEqual([]);
  });

  test("terminates on a parent cycle", () => {
    const registry = withConcepts([
      concept("a", { parentId: "b" as ConceptId }),
      concept("b", { parentId: "a" as ConceptId }),
    ]);
    expect(ancestors(registry, "a" as ConceptId).length).toBeLessThan(5);
  });
});

describe("parent rules", () => {
  test("a concept at max depth grafts new children as its siblings", () => {
    const registry = withConcepts([
      concept("l1", { parentId: "programming-fundamentals" as ConceptId }),
      concept("l2", { parentId: "l1" as ConceptId }),
      concept("l3", { parentId: "l2" as ConceptId }),
    ]);
    expect(depth(registry, "l3" as ConceptId)).toBe(3);

    const result = resolveConcept(registry, "very-deep-topic", {
      parentHint: "l3" as ConceptId,
      now: NOW,
    });

    expect(result.status).toBe("created");
    if (result.status !== "created") return;
    expect(result.concept.parentId).toBe("l2" as ConceptId);
  });

  test("an unknown parent hint produces a root, not a broken reference", () => {
    const result = resolveConcept(seedRegistry(NOW), "orphan-topic", {
      parentHint: "does-not-exist" as ConceptId,
      now: NOW,
    });

    expect(result.status).toBe("created");
    if (result.status !== "created") return;
    expect(result.concept.parentId).toBeNull();
  });
});
