import type { InferredSignal, LearnerModel, SessionState } from "@hibi/core";

import { ui } from "./render";

const MASTERY_ROWS = 15;

export function formatState(session: SessionState): string {
  const lines: string[] = [];
  const active = session.items.find((item) => item.id === session.activeItemId);

  if (active === undefined) {
    lines.push(ui.dim("nothing active"));
  } else {
    const ladder =
      active.ladder === undefined ? "" : ` · step ${active.ladder.step}/3`;
    lines.push(
      `exercise · ${active.conceptId}${ladder} · ${active.attempts} attempts`,
    );
    lines.push(ui.dim(`  ${active.statement}`));
  }

  const open = session.items.filter(
    (item) => item.status === "active" && item.id !== active?.id,
  );
  if (open.length > 0) {
    lines.push(
      ui.dim(
        `${open.length} other open: ${open.map((item) => item.conceptId).join(", ")}`,
      ),
    );
  }

  if (session.pending?.type === "quiz") {
    const quiz = session.pending;
    lines.push(
      ui.dim(
        `quiz open: question ${quiz.cursor + 1} of ${quiz.questions.length}`,
      ),
    );
  }

  if (session.dispute !== null) {
    lines.push(ui.dim(`disputed: ${session.dispute.conceptId}`));
  }

  const findings = session.findings.filter(
    (finding) => finding.status !== "resolved",
  );
  if (findings.length > 0) {
    lines.push(ui.dim(`${findings.length} open findings`));
  }

  if (session.contextFiles.length > 0) {
    lines.push(ui.dim(`files: ${session.contextFiles.join(", ")}`));
  }

  lines.push(ui.dim(`turn ${session.turnCount}`));
  return lines.join("\n");
}

export function formatProfile(learner: LearnerModel): string {
  const lines: string[] = [];

  if (learner.goal !== null && learner.goal.status === "active") {
    lines.push(ui.bold("working toward"));
    lines.push(`  ${learner.goal.statement}`);
    if (learner.goal.skipped.length > 0) {
      lines.push(ui.dim(`  skipped: ${learner.goal.skipped.join(", ")}`));
    }
    lines.push("");
  }

  lines.push(ui.bold("preferences"));

  for (const [key, value] of Object.entries(learner.preferences)) {
    lines.push(`  ${key} = ${value === "" ? ui.dim("(unset)") : value}`);
  }

  if (learner.mastery.length === 0) {
    lines.push(ui.dim("\nno mastery recorded yet"));
    return lines.join("\n");
  }

  lines.push(`\n${ui.bold("mastery")}`);
  const ranked = learner.mastery
    .slice()
    .sort((a, b) => b.confidence - a.confidence);

  for (const entry of ranked.slice(0, MASTERY_ROWS)) {
    lines.push(
      `  ${entry.conceptId}: ${entry.level.toFixed(2)} ${ui.dim(
        `(confidence ${entry.confidence.toFixed(2)}, ${entry.directEvidenceCount} direct)`,
      )}`,
    );
  }

  if (learner.recurringErrors.length > 0) {
    lines.push(`\n${ui.bold("recurring mistakes")}`);
    for (const error of learner.recurringErrors) {
      lines.push(`  ${error.description} ${ui.dim(`(${error.occurrences}x)`)}`);
    }
  }

  lines.push(
    ui.dim(
      "\ndisagree with a number? say so — hibi will offer a way to show otherwise",
    ),
  );
  return lines.join("\n");
}

export function formatSignals(signals: InferredSignal[]): string {
  if (signals.length === 0) {
    return ui.dim("hibi has not inferred anything about you yet");
  }

  const lines = [ui.bold("observed tendencies")];

  for (const signal of signals) {
    const confidence = `${Math.round(signal.confidence * 100)}%`;
    lines.push(
      `  ${signal.key} = ${signal.value} ${ui.dim(`(${confidence}, ${signal.evidenceCount} events)`)}`,
    );
  }

  lines.push(
    ui.dim(
      "  these are guesses — declare the opposite with /prefs to override one",
    ),
  );
  return lines.join("\n");
}
