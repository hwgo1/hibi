import { describe, expect, test } from "bun:test";

import {
  seedRegistry,
  type ConceptId,
  type ConceptRegistry,
} from "../src/concepts";
import {
  ancestors,
  depth,
  indexConcepts,
  lookupConcept,
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

  test("creates an unrelated term under the suggested parent, normalizing it", () => {
    const registry = seedRegistry(NOW);
    const result = resolveConcept(registry, "goroutines", {
      parentTerm: "Concurrency",
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

  test("an ambiguous term returns the candidates instead of creating", () => {
    const registry = withConcepts([concept("hash-map"), concept("hash-set")]);
    const result = resolveConcept(registry, "hash mapping", { now: NOW });

    expect(result.status).toBe("ambiguous");
    if (result.status !== "ambiguous") return;
    expect(result.candidates.map((c) => c.id)).toContain(
      "hash-map" as ConceptId,
    );
  });
});

describe("lookupConcept", () => {
  test("matches regardless of case", () => {
    const lookup = lookupConcept(seedRegistry(NOW), "Concurrency");
    expect(lookup.status === "matched" && lookup.concept.id).toBe(
      "concurrency" as ConceptId,
    );
  });

  test("never creates a concept or learns an alias", () => {
    const registry = withConcepts([concept("linked-list")]);
    expect(lookupConcept(registry, "goroutines").status).toBe("unknown");
    expect(lookupConcept(registry, "linked lists").status).toBe("matched");
    expect(registry.concepts.at(-1)?.aliases).toEqual([]);
  });

  test("lists candidates for an ambiguous term", () => {
    const registry = withConcepts([concept("hash-map"), concept("hash-set")]);
    expect(lookupConcept(registry, "hash mapping").status).toBe("ambiguous");
  });
});

describe("ancestors", () => {
  test("returns the chain nearest first", () => {
    const registry = withConcepts([
      concept("goroutines", { parentId: "concurrency" as ConceptId }),
    ]);
    const chain = ancestors(
      indexConcepts(registry),
      "goroutines" as ConceptId,
    ).map((c) => c.id);
    expect(chain).toEqual([
      "concurrency",
      "programming-fundamentals",
    ] as ConceptId[]);
  });

  test("returns empty for a root", () => {
    expect(
      ancestors(indexConcepts(seedRegistry(NOW)), "backend" as ConceptId),
    ).toEqual([]);
  });

  test("terminates on a parent cycle", () => {
    const registry = withConcepts([
      concept("a", { parentId: "b" as ConceptId }),
      concept("b", { parentId: "a" as ConceptId }),
    ]);
    expect(
      ancestors(indexConcepts(registry), "a" as ConceptId).length,
    ).toBeLessThan(5);
  });
});

describe("parent rules", () => {
  test("a concept at max depth grafts new children as its siblings", () => {
    const registry = withConcepts([
      concept("l1", { parentId: "programming-fundamentals" as ConceptId }),
      concept("l2", { parentId: "l1" as ConceptId }),
      concept("l3", { parentId: "l2" as ConceptId }),
    ]);
    expect(depth(indexConcepts(registry), "l3" as ConceptId)).toBe(3);

    const result = resolveConcept(registry, "very-deep-topic", {
      parentTerm: "l3",
      now: NOW,
    });

    expect(result.status).toBe("created");
    if (result.status !== "created") return;
    expect(result.concept.parentId).toBe("l2" as ConceptId);
  });

  test("an unknown parent term produces a root, not a broken reference", () => {
    const result = resolveConcept(seedRegistry(NOW), "orphan-topic", {
      parentTerm: "does-not-exist",
      now: NOW,
    });

    expect(result.status).toBe("created");
    if (result.status !== "created") return;
    expect(result.concept.parentId).toBeNull();
  });
});
