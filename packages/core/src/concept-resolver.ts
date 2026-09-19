import type { Concept, ConceptId, ConceptRegistry } from "./concepts";
import { MAX_CONCEPT_DEPTH } from "./concepts";

/**
 * Lowercases, strips diacritics and punctuation, and collapses whitespace to
 * single hyphens, so that "Listas Encadeadas" and "listas-encadeadas"
 * produce the same lookup key.
 */
export function normalizeTerm(term: string): string {
  return term
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const MAX_TERM_WORDS = 4;

const QUESTION_PREFIXES = [
  "how",
  "what",
  "why",
  "when",
  "where",
  "which",
  "who",
  "can",
  "does",
  "is",
  "should",
];

/**
 * Rejects terms that are questions or sentences rather than durable topics.
 * Returns a reason when the term is unusable, or null when it is fine
 */
export function validateConceptTerm(term: string): string | null {
  if (/\?/.test(term))
    return "looks like a question — pass the topic it is about";

  const normalized = normalizeTerm(term);
  if (normalized.length === 0) return "empty term";

  const words = normalized.split("-").filter((word) => word.length > 0);
  if (words.length > MAX_TERM_WORDS) {
    return `too long (${words.length} words) — pass the underlying topic instead`;
  }

  const first = words[0];
  if (first !== undefined && QUESTION_PREFIXES.includes(first)) {
    return "looks like a question — pass the topic it is about";
  }

  return null;
}

/** Follows merge pointers to the surviving concept */
export function canonical(
  registry: ConceptRegistry,
  id: ConceptId,
): Concept | null {
  const seen = new Set<string>();
  let current = registry.concepts.find((c) => c.id === id) ?? null;

  while (
    current !== null &&
    current.mergedInto !== null &&
    !seen.has(current.id)
  ) {
    seen.add(current.id);
    const next = current.mergedInto;
    current = registry.concepts.find((c) => c.id === next) ?? null;
  }
  return current;
}

/** Walks parent links, nearest first, for mastery roll-up */
export function ancestors(registry: ConceptRegistry, id: ConceptId): Concept[] {
  const chain: Concept[] = [];
  const seen = new Set<string>();
  let current = canonical(registry, id);

  while (
    current !== null &&
    current.parentId !== null &&
    !seen.has(current.id)
  ) {
    seen.add(current.id);
    const parent = canonical(registry, current.parentId);
    if (parent === null) break;
    chain.push(parent);
    current = parent;
  }
  return chain;
}

/** Distance from a root. A root is depth 0 */
export function depth(registry: ConceptRegistry, id: ConceptId): number {
  return ancestors(registry, id).length;
}

export type ResolveOutcome =
  | { status: "matched"; concept: Concept; registry: ConceptRegistry }
  | { status: "created"; concept: Concept; registry: ConceptRegistry }
  | { status: "ambiguous"; candidates: Concept[] };

export interface ResolveOptions {
  /**
   * Parent proposed by the caller. Must already exist in the registry:
   * a concept and its parent are never created in the same operation.
   */
  parentHint?: ConceptId;
  now: Date;
}

/** Dice coefficient over character bigrams. Catches spelling variants only */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigrams = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const gram = s.slice(i, i + 2);
      out.set(gram, (out.get(gram) ?? 0) + 1);
    }
    return out;
  };

  const left = bigrams(a);
  const right = bigrams(b);
  let shared = 0;
  for (const [gram, count] of left) {
    shared += Math.min(count, right.get(gram) ?? 0);
  }
  return (2 * shared) / (a.length - 1 + b.length - 1);
}

const MATCH_THRESHOLD = 0.85;
const AMBIGUOUS_THRESHOLD = 0.6;

/** Single entry point from a natural-language term to concept. The model never writes a concept id directly */
export function resolveConcept(
  registry: ConceptRegistry,
  term: string,
  options: ResolveOptions,
): ResolveOutcome {
  const key = normalizeTerm(term);
  if (key.length === 0) {
    return { status: "ambiguous", candidates: [] };
  }

  const live = registry.concepts.filter((c) => c.mergedInto === null);

  const exact = live.find((c) => c.id === key || c.aliases.includes(key));
  if (exact) {
    return { status: "matched", concept: exact, registry };
  }

  const scored = live
    .map((c) => ({
      concept: c,
      score: Math.max(
        similarity(key, c.id),
        ...c.aliases.map((alias) => similarity(key, alias)),
        similarity(key, normalizeTerm(c.canonicalName)),
      ),
    }))
    .sort((x, y) => y.score - x.score);

  const best = scored[0];

  if (best && best.score >= MATCH_THRESHOLD) {
    const updated: Concept = {
      ...best.concept,
      aliases: [...best.concept.aliases, key],
    };
    return {
      status: "matched",
      concept: updated,
      registry: replaceConcept(registry, updated, options.now),
    };
  }

  const nearby = scored
    .filter((entry) => entry.score >= AMBIGUOUS_THRESHOLD)
    .map((entry) => entry.concept);

  if (nearby.length > 0) {
    return { status: "ambiguous", candidates: nearby.slice(0, 5) };
  }

  return createConcept(registry, key, term, options);
}

function createConcept(
  registry: ConceptRegistry,
  id: string,
  originalTerm: string,
  options: ResolveOptions,
): ResolveOutcome {
  const concept: Concept = {
    id: id as ConceptId,
    canonicalName: originalTerm.trim(),
    aliases: [],
    parentId: resolveParent(registry, options.parentHint),
    source: "proposed",
    createdAt: options.now.toISOString(),
    mergedInto: null,
  };

  return {
    status: "created",
    concept,
    registry: {
      ...registry,
      updatedAt: options.now.toISOString(),
      concepts: [...registry.concepts, concept],
    },
  };
}

/**
 * Enforces the two structural rules on parenthood: the parent must already
 * exist, and attaching to a parent at max depth grafts the concept as its
 * sibling instead of deepening the tree.
 */
function resolveParent(
  registry: ConceptRegistry,
  hint: ConceptId | undefined,
): ConceptId | null {
  if (hint === undefined) return null;

  const parent = canonical(registry, hint);
  if (parent === null) return null;

  if (depth(registry, parent.id) >= MAX_CONCEPT_DEPTH - 1) {
    return parent.parentId;
  }
  return parent.id;
}

function replaceConcept(
  registry: ConceptRegistry,
  concept: Concept,
  now: Date,
): ConceptRegistry {
  return {
    ...registry,
    updatedAt: now.toISOString(),
    concepts: registry.concepts.map((c) => (c.id === concept.id ? concept : c)),
  };
}
