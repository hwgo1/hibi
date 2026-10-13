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

export type ConceptIndex = ReadonlyMap<string, Concept>;

export function indexConcepts(registry: ConceptRegistry): ConceptIndex {
  return new Map(registry.concepts.map((concept) => [concept.id, concept]));
}

/** Walks parent links, nearest first, for mastery roll-up */
export function ancestors(index: ConceptIndex, id: ConceptId): Concept[] {
  const chain: Concept[] = [];
  const seen = new Set<string>([id]);
  let parentId = index.get(id)?.parentId ?? null;

  while (parentId !== null && !seen.has(parentId)) {
    const parent = index.get(parentId);
    if (parent === undefined) break;
    seen.add(parent.id);
    chain.push(parent);
    parentId = parent.parentId;
  }
  return chain;
}

/** Distance from a root. A root is depth 0 */
export function depth(index: ConceptIndex, id: ConceptId): number {
  return ancestors(index, id).length;
}

export type ResolveOutcome =
  | { status: "matched"; concept: Concept; registry: ConceptRegistry }
  | { status: "created"; concept: Concept; registry: ConceptRegistry }
  | { status: "ambiguous"; candidates: Concept[] };

export interface ResolveOptions {
  /**
   * Broader concept proposed by the caller, resolved like any term. It must
   * already exist: a concept and its parent are never created together
   */
  parentTerm?: string;
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

  const exact = exactMatch(registry, key);
  if (exact !== undefined) {
    return { status: "matched", concept: exact, registry };
  }

  const scored = rank(registry, key);
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

/** Matches an existing concept without creating one or learning an alias */
export function findConcept(
  registry: ConceptRegistry,
  term: string,
): Concept | undefined {
  const key = normalizeTerm(term);
  if (key.length === 0) return undefined;
  const exact = exactMatch(registry, key);
  if (exact !== undefined) return exact;
  const best = rank(registry, key)[0];
  return best !== undefined && best.score >= MATCH_THRESHOLD
    ? best.concept
    : undefined;
}

function exactMatch(
  registry: ConceptRegistry,
  key: string,
): Concept | undefined {
  return registry.concepts.find(
    (concept) => concept.id === key || concept.aliases.includes(key),
  );
}

function rank(
  registry: ConceptRegistry,
  key: string,
): Array<{ concept: Concept; score: number }> {
  return registry.concepts
    .map((concept) => ({
      concept,
      score: Math.max(
        similarity(key, concept.id),
        ...concept.aliases.map((alias) => similarity(key, alias)),
        similarity(key, normalizeTerm(concept.canonicalName)),
      ),
    }))
    .sort((x, y) => y.score - x.score);
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
    parentId: resolveParent(registry, options.parentTerm),
    source: "proposed",
    createdAt: options.now.toISOString(),
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
  parentTerm: string | undefined,
): ConceptId | null {
  if (parentTerm === undefined) return null;

  const parent = findConcept(registry, parentTerm);
  if (parent === undefined) return null;

  if (depth(indexConcepts(registry), parent.id) >= MAX_CONCEPT_DEPTH - 1) {
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
