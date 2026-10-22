import { readFile } from "node:fs/promises";
import { join } from "node:path";

const NUMSTAT_COMMIT_LIMIT = 2000;
const GIT_TIMEOUT_MS = 30_000;

/** Lines the user wrote per file, committed or not */
export interface AuthorshipReport {
  hasGit: boolean;
  /** Repo-relative path to lines added by the current user */
  linesByFile: Map<string, number>;
}

const EMPTY: AuthorshipReport = { hasGit: false, linesByFile: new Map() };

/**
 * Attributes authorship from the commit history and the working tree.
 *
 * Whatever is not committed yet was written on this machine, so it counts as
 * the user's: staged and unstaged changes, and untracked files among
 * `candidates`, the repo-relative paths the walk kept. Paths are relative to
 * `repoRoot` even when it sits inside a larger repository.
 *
 * Returns an empty report when the directory is not a repository or git is
 * unavailable, which degrades hibi calibration without breaking it
 */
export async function readAuthorship(
  repoRoot: string,
  candidates: ReadonlySet<string>,
): Promise<AuthorshipReport> {
  const inside = await gitOutput(repoRoot, ["rev-parse", "--is-inside-work-tree"]);
  if (inside?.trim() !== "true") return EMPTY;

  const linesByFile = new Map<string, number>();
  const add = (path: string, lines: number) =>
    linesByFile.set(path, (linesByFile.get(path) ?? 0) + lines);

  const email = (await gitOutput(repoRoot, ["config", "user.email"]))
    ?.trim()
    .toLowerCase();
  if (email !== undefined && email.length > 0) {
    // A repository without commits makes `log` fail: nothing is committed yet
    const log = await gitOutput(repoRoot, [
      "log",
      `--max-count=${NUMSTAT_COMMIT_LIMIT}`,
      "--numstat",
      "--relative",
      "--no-renames",
      "--format=%x00%ae",
    ]);
    for (const [path, lines] of parseLog(log ?? "", email)) add(path, lines);
  }

  for (const staged of [["--cached"], []]) {
    const diff = await gitOutput(repoRoot, [
      "diff",
      ...staged,
      "--numstat",
      "--relative",
      "--no-renames",
    ]);
    for (const [path, lines] of parseNumstat(diff ?? "")) add(path, lines);
  }

  const untracked = await gitOutput(repoRoot, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ]);
  for (const path of (untracked ?? "").split("\u0000")) {
    if (!candidates.has(path)) continue;
    add(path, await countLines(join(repoRoot, path)));
  }

  return { hasGit: true, linesByFile };
}

/**
 * Sums lines the given author added, per file, across the commit log.
 *
 * Commit shape is deliberately ignored: how much arrives in one commit is a
 * matter of working habit, so treating a large single commit as suspicious
 * would penalize anyone who commits completed work rather than every few
 * lines. Distinguishing written from pasted code needs direct observation of
 * editing, not inference from history
 */
function parseLog(log: string, me: string): [string, number][] {
  const entries: [string, number][] = [];

  for (const chunk of log.split("\u0000")) {
    const newline = chunk.indexOf("\n");
    if (newline === -1) continue;
    if (chunk.slice(0, newline).trim().toLowerCase() !== me) continue;
    entries.push(...parseNumstat(chunk.slice(newline + 1)));
  }

  return entries;
}

/** Binary files report `-` and are skipped */
function parseNumstat(text: string): [string, number][] {
  const entries: [string, number][] = [];

  for (const line of text.split("\n")) {
    const parts = line.split("\t");
    if (parts.length !== 3) continue;

    const added = Number.parseInt(parts[0] ?? "", 10);
    const path = parts[2] ?? "";
    if (Number.isNaN(added) || path.length === 0) continue;
    entries.push([path, added]);
  }

  return entries;
}

async function countLines(path: string): Promise<number> {
  try {
    const text = await readFile(path, "utf8");
    if (text.length === 0) return 0;
    const breaks = text.split("\n").length - 1;
    return text.endsWith("\n") ? breaks : breaks + 1;
  } catch {
    return 0;
  }
}

async function gitOutput(cwd: string, args: string[]): Promise<string | null> {
  try {
    const proc = Bun.spawn(["git", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "ignore",
    });

    const timeout = setTimeout(() => proc.kill(), GIT_TIMEOUT_MS);
    const text = await new Response(proc.stdout).text();
    clearTimeout(timeout);

    return (await proc.exited) === 0 ? text : null;
  } catch {
    return null;
  }
}
