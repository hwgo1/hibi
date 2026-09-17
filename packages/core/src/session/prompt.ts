import type { Concept, ConceptRegistry } from "../concepts";
import type { RepoModel } from "../schemas/repo";
import type { LearnerModel, MasteryEntry } from "../schemas/learner";
import type { Intent, SessionState } from "../schemas/session";
import { STALE_INTENT_THRESHOLD_MS } from "../schemas/session";
import type { Workspace } from "../ports/workspace";
import { TUTOR_RULES } from "./rules";

/** Caps keeping the prompt bounded regardless of how much history exists. */
const LIMITS = {
  masteryEntries: 12,
  concepts: 40,
  recurringErrors: 5,
  intents: 6,
  findings: 8,
  contextFileBytes: 12_000,
} as const;

export interface PromptInput {
  learner: LearnerModel;
  session: SessionState;
  registry: ConceptRegistry;
  repo: RepoModel | null;
  workspace: Workspace;
  now: Date;
}

export async function buildSystemPrompt(input: PromptInput): Promise<string> {
  const sections = [
    TUTOR_RULES,
    renderLearner(input.learner),
    renderConcepts(input.registry, input.learner),
    renderSession(input.session, input.now),
    renderRepo(input.repo),
    await renderContextFiles(input.session, input.workspace),
  ];
  return sections.filter((s) => s.length > 0).join("\n\n");
}

/**
 * Declared preferences win over inferred signals: a signal contradicting an
 * explicit setting is dropped rather than reconciled, so an inference the
 * user never confirmed cannot quietly change how they are taught
 */
function renderLearner(learner: LearnerModel): string {
  const p = learner.preferences;
  const lines = [
    `<learner>`,
    `language: ${p.language}`,
    `theory depth: ${p.theoryDepth}`,
    `exercise size: ${p.exerciseSize}`,
    `unsolicited hints: ${p.unsolicitedHints}`,
    `explanation style: ${p.explanationStyle}`,
  ];

  const mastery = topMastery(learner.mastery);
  if (mastery.length > 0) {
    lines.push(`mastery:`);
    for (const entry of mastery) {
      lines.push(
        `  ${entry.conceptId}: ${entry.level.toFixed(2)} (confidence ${entry.confidence.toFixed(2)})`,
      );
    }
  }

  const errors = learner.recurringErrors
    .slice()
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, LIMITS.recurringErrors);
  if (errors.length > 0) {
    lines.push(`recurring mistakes:`);
    for (const error of errors) {
      lines.push(
        `  ${error.description} (${error.occurrences}x, ${error.conceptId})`,
      );
    }
  }

  const signals = learner.inferredSignals.filter(
    (s) => s.confidence >= 0.5 && !contradictsDeclared(s.key, learner),
  );
  if (signals.length > 0) {
    lines.push(`observed tendencies (advisory):`);
    for (const signal of signals) {
      lines.push(`  ${signal.key}: ${signal.value}`);
    }
  }

  lines.push(`</learner>`);
  return lines.join("\n");
}

function contradictsDeclared(key: string, learner: LearnerModel): boolean {
  return Object.keys(learner.preferences).includes(key);
}

/** Highest confidence first, so a crowded model still shows what is known best */
function topMastery(entries: MasteryEntry[]): MasteryEntry[] {
  return entries
    .slice()
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, LIMITS.masteryEntries);
}

/**
 * Lists the vocabulary the user has built. This is what keeps the model
 * reusing an existing term instead of coining a variant the resolver would
 * have to reconcile later
 */
function renderConcepts(
  registry: ConceptRegistry,
  learner: LearnerModel,
): string {
  const known = new Set(learner.mastery.map((m) => m.conceptId));
  const live = registry.concepts.filter((c) => c.mergedInto === null);

  const ranked = live
    .slice()
    .sort((a, b) => rank(b, known) - rank(a, known))
    .slice(0, LIMITS.concepts);

  const lines = ranked.map((c) =>
    c.parentId === null ? `  ${c.id}` : `  ${c.id} (under ${c.parentId})`,
  );
  return [`<concepts>`, ...lines, `</concepts>`].join("\n");
}

function rank(concept: Concept, known: Set<string>): number {
  let score = 0;
  if (known.has(concept.id)) score += 2;
  if (concept.source === "seed") score += 1;
  return score;
}

function renderSession(session: SessionState, now: Date): string {
  const lines = [`<session>`, `turn: ${session.turnCount}`];

  const intents = session.intents
    .filter((i) => i.status === "active" || i.status === "stale")
    .slice(-LIMITS.intents);

  if (intents.length > 0) {
    lines.push(`intents:`);
    for (const intent of intents) {
      lines.push(`  ${describeIntent(intent, session.activeIntentId, now)}`);
    }
  }

  const findings = session.findings
    .filter((f) => f.status !== "resolved")
    .slice(0, LIMITS.findings);
  if (findings.length > 0) {
    lines.push(`open findings:`);
    for (const finding of findings) {
      lines.push(
        `  ${finding.id} [${finding.status}] ${finding.anchor.filePath}: ${finding.summary}` +
          (finding.isRecurring ? ` (recurring mistake)` : ``),
      );
    }
  }

  if (session.contextFiles.length > 0) {
    lines.push(`files in context: ${session.contextFiles.join(", ")}`);
  }

  lines.push(`</session>`);
  return lines.join("\n");
}

function describeIntent(
  intent: Intent,
  activeId: string | null,
  now: Date,
): string {
  const marker = intent.id === activeId ? "* " : "  ";
  const stale = isStale(intent, now)
    ? " STALE — ask once if this was finished or dropped"
    : "";

  if (intent.kind === "explain") {
    return `${marker}${intent.id} explain ${intent.conceptId}${stale}`;
  }
  if (intent.kind === "exercise") {
    return `${marker}${intent.id} exercise ${intent.conceptId}: ${intent.statement}${stale}`;
  }
  return (
    `${marker}${intent.id} resolve ${intent.conceptId} ` +
    `step ${intent.step}/3, ${intent.attempts} attempts, ${intent.hintsGiven} hints${stale}`
  );
}

function isStale(intent: Intent, now: Date): boolean {
  return (
    now.getTime() - Date.parse(intent.lastTouchedAt) >=
    STALE_INTENT_THRESHOLD_MS
  );
}

function renderRepo(repo: RepoModel | null): string {
  if (repo === null) return "";

  const lines = [`<repo>`];
  for (const sub of repo.subprojects) {
    lines.push(
      `  ${sub.path}: ${sub.languages.join(", ")}` +
        (sub.testCommand !== undefined ? ` · tests: ${sub.testCommand}` : ``),
    );
  }
  if (!repo.hasGit) {
    lines.push(
      `  no git: authorship unknown, treat calibration signals as weak`,
    );
  }
  lines.push(
    `  files: ${repo.fileStats.user} authored by the user of ${repo.fileStats.total} total`,
  );
  if (repo.treeSummary.length > 0) {
    lines.push(repo.treeSummary);
  }
  lines.push(`</repo>`);
  return lines.join("\n");
}

/**
 * Files pinned to the session, truncated to a fixed budget. A file that
 * cannot be read is reported rather than silently omitted, since a missing
 * file changes what the tutor should say.
 */
async function renderContextFiles(
  session: SessionState,
  workspace: Workspace,
): Promise<string> {
  if (session.contextFiles.length === 0) return "";

  const blocks: string[] = [];
  let budget = LIMITS.contextFileBytes;

  for (const path of session.contextFiles) {
    if (budget <= 0) break;
    try {
      const file = await workspace.readFile(path);
      const text =
        file.text.length > budget
          ? `${file.text.slice(0, budget)}\n[truncated]`
          : file.text;
      budget -= text.length;
      blocks.push(`--- ${file.path}${file.dirty ? " (unsaved)" : ""}\n${text}`);
    } catch (error) {
      blocks.push(
        `--- ${path}\n[unreadable: ${error instanceof Error ? error.message : "error"}]`,
      );
    }
  }

  return [`<files>`, ...blocks, `</files>`].join("\n");
}
