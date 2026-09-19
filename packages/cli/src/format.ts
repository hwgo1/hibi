import type { LearnerModel, SessionState } from "@hibi/core";

import { ui } from "./render";

const MASTERY_ROWS = 15;

export function formatState(session: SessionState): string {
  const lines: string[] = [];
  const active = session.intents.find(
    (intent) => intent.id === session.activeIntentId,
  );

  if (active === undefined) {
    lines.push(ui.dim("nothing active"));
  } else if (active.kind === "resolve") {
    lines.push(
      `${active.conceptId} · step ${active.step}/3 · ${active.attempts} attempts`,
    );
  } else if (active.kind === "exercise") {
    lines.push(`exercise · ${active.conceptId}`);
    lines.push(ui.dim(`  ${active.statement}`));
  } else {
    lines.push(`explaining · ${active.conceptId}`);
  }

  const open = session.intents.filter(
    (intent) => intent.status === "active" && intent.id !== active?.id,
  );
  if (open.length > 0) {
    lines.push(
      ui.dim(
        `${open.length} other open: ${open.map((intent) => intent.conceptId).join(", ")}`,
      ),
    );
  }

  const stale = session.intents.filter((intent) => intent.status === "stale");
  if (stale.length > 0) {
    lines.push(
      ui.dim(
        `${stale.length} stale: ${stale.map((intent) => intent.conceptId).join(", ")}`,
      ),
    );
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
  const lines = [ui.bold("preferences")];

  for (const [key, value] of Object.entries(learner.preferences)) {
    lines.push(`  ${key} = ${value}`);
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
        `(confidence ${entry.confidence.toFixed(2)})`,
      )}`,
    );
  }

  if (learner.recurringErrors.length > 0) {
    lines.push(`\n${ui.bold("recurring mistakes")}`);
    for (const error of learner.recurringErrors) {
      lines.push(`  ${error.description} ${ui.dim(`(${error.occurrences}x)`)}`);
    }
  }

  return lines.join("\n");
}
