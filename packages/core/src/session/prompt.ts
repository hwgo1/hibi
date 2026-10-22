import type { Concept, ConceptRegistry } from "../concepts";
import type { SystemPrompt } from "../ports/llm";
import type { Workspace } from "../ports/workspace";
import type { LearnerModel, MasteryEntry } from "../schemas/learner";
import type { RepoModel } from "../schemas/repo";
import type { Pending, SessionState, WorkItem } from "../schemas/session";
import { STALE_ITEM_THRESHOLD_MS } from "../schemas/session";
import { describeCheck } from "../verify/checks";
import { TUTOR_RULES } from "./rules";

/** Caps keeping the prompt bounded regardless of how much history exists. */
const LIMITS = {
  masteryEntries: 12,
  concepts: 40,
  recurringErrors: 5,
  items: 6,
  findings: 8,
  learnerFiles: 15,
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

/**
 * Rebuilds the system prompt from persisted state on every turn. Nothing the
 * tutor needs lives in the transcript, so the transcript can be truncated
 * freely without losing the exercise, the ladder position or the history.
 *
 * Providers bill a cached prefix at a fraction of the input rate, and the
 * cache holds only up to the first byte that differs. The stable part holds
 * what changes at most when evidence is recorded: rules, repository, concepts
 * and learner. The volatile part holds pinned files and the session, which
 * change on most turns. The session carries no turn counter, which would
 * change on every call.
 */
export async function buildSystemPrompt(
  input: PromptInput,
): Promise<SystemPrompt> {
  const stable = [
    TUTOR_RULES,
    renderRepo(input.repo),
    renderConcepts(input.registry, input.learner),
    renderLearner(input.learner),
  ];
  const volatile = [
    await renderContextFiles(input.session, input.workspace),
    renderSession(input.session, input.now),
  ];
  return { stable: joinSections(stable), volatile: joinSections(volatile) };
}

function joinSections(sections: string[]): string {
  return sections.filter((section) => section.length > 0).join("\n\n");
}

/**
 * Declared preferences win over inferred signals: a signal contradicting an
 * explicit setting is dropped rather than reconciled, so an inference the user
 * never confirmed cannot quietly change how they are taught.
 */
function renderLearner(learner: LearnerModel): string {
  const p = learner.preferences;
  const lines = [`<learner>`];

  if (p.name.length > 0) lines.push(`name: ${p.name}`);
  lines.push(
    `reply language: ${p.language}`,
    `theory depth: ${p.theoryDepth}`,
    `exercise size: ${p.exerciseSize}`,
    `unsolicited hints: ${p.unsolicitedHints}`,
    `explanation style: ${p.explanationStyle}`,
  );

  if (learner.goal !== null && learner.goal.status === "active") {
    const goal = learner.goal;
    lines.push(`working toward: ${goal.statement}`);
    if (goal.language !== undefined) {
      lines.push(`programming language: ${goal.language}`);
    }
    if (goal.skipped.length > 0) {
      lines.push(`says they already know: ${goal.skipped.join(", ")}`);
    }
  }

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
    (signal) =>
      signal.confidence >= 0.5 && !contradictsDeclared(signal.key, learner),
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

/** Highest confidence first, so a crowded model still shows what is known best. */
function topMastery(entries: MasteryEntry[]): MasteryEntry[] {
  return entries
    .slice()
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, LIMITS.masteryEntries);
}

/**
 * Lists the vocabulary the user has built, which keeps the model reusing an
 * existing term instead of coining a variant the resolver must reconcile.
 */
function renderConcepts(
  registry: ConceptRegistry,
  learner: LearnerModel,
): string {
  const known = new Set(learner.mastery.map((m) => m.conceptId));
  const ranked = registry.concepts
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

/**
 * The session is what makes a reference like "this" resolvable and what
 * carries the ladder across turns. Stale items are surfaced so the tutor can
 * ask once whether they were finished or dropped.
 */
function renderSession(session: SessionState, now: Date): string {
  const lines = [`<session>`];

  const items = session.items
    .filter((item) => item.status === "active")
    .slice(-LIMITS.items);

  if (items.length > 0) {
    lines.push(`items:`);
    for (const item of items) {
      lines.push(`  ${describeItem(item, session.activeItemId, now)}`);
    }
  }

  const findings = session.findings
    .filter((finding) => finding.status !== "resolved")
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

  lines.push(...renderPending(session.pending));

  if (session.dispute !== null) {
    lines.push(
      `${session.dispute.conceptId} is disputed: settle it with a quiz or an exercise on it`,
    );
  }

  if (lines.length === 1) lines.push(`nothing open`);
  lines.push(`</session>`);
  return lines.join("\n");
}

/**
 * The pending quiz question is shown in full, without its answer, so the tutor
 * can put it again after a restart that lost the transcript
 */
function renderPending(pending: Pending | null): string[] {
  if (pending === null) return [];

  if (pending.type === "question") {
    return [
      `awaiting an answer to: "${pending.question}" — call record_answer with their reply`,
    ];
  }

  const question = pending.questions[pending.cursor];
  if (question === undefined) return [];
  return [
    `quiz open, question ${pending.cursor + 1} of ${pending.questions.length} — call answer_quiz with their reply:`,
    `  ${question.prompt}`,
    ...question.options.map((option) => `  ${option.id}) ${option.text}`),
  ];
}

function describeItem(
  item: WorkItem,
  activeId: string | null,
  now: Date,
): string {
  const marker = item.id === activeId ? "* " : "  ";
  const check =
    item.check === undefined
      ? " · no check"
      : ` · check: ${describeCheck(item.check)}`;
  const ladder =
    item.ladder === undefined
      ? ""
      : ` · step ${item.ladder.step}/3, ${item.ladder.hintsGiven} hints`;
  const prediction =
    item.prediction === undefined
      ? ""
      : ` · predicted ${item.prediction.predicted}`;
  const stale =
    now.getTime() - Date.parse(item.lastTouchedAt) >= STALE_ITEM_THRESHOLD_MS
      ? " STALE — ask once if this was finished or dropped"
      : "";

  const edits = item.edits > 0 ? ` · ${item.edits} edits` : "";

  return `${marker}${item.id} exercise ${item.conceptId}: ${item.statement}${check} · ${item.attempts} attempts${edits}${ladder}${prediction}${stale}`;
}

function renderRepo(repo: RepoModel | null): string {
  if (repo === null) return "";

  const lines = [`<repo>`];
  for (const sub of repo.subprojects) {
    lines.push(
      `  ${sub.path}: ${sub.languages.join(", ")}` +
        (sub.languageVersion !== undefined ? ` ${sub.languageVersion}` : ``) +
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
  const authored = repo.userAuthoredFiles.slice(0, LIMITS.learnerFiles);
  if (authored.length > 0) {
    const more = repo.userAuthoredFiles.length - authored.length;
    lines.push(
      `  written by the user: ${authored.join(", ")}${more > 0 ? ` (+${more} more)` : ""}`,
    );
  }
  if (repo.treeSummary.length > 0) {
    lines.push(repo.treeSummary);
  }
  lines.push(`</repo>`);
  return lines.join("\n");
}

/**
 * Files pinned to the session, truncated to a fixed budget. A file that cannot
 * be read is reported, since a missing file changes what hibi should say
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
