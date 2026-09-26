const NUMSTAT_COMMIT_LIMIT = 2000;
const GIT_TIMEOUT_MS = 30_000;

/** Lines the user added per file, and how concentrated authorship is overall */
export interface AuthorshipReport {
  hasGit: boolean;
  singleAuthor: boolean;
  /** Repo-relative path to lines added by the current user */
  linesByFile: Map<string, number>;
}

const EMPTY: AuthorshipReport = {
  hasGit: false,
  singleAuthor: false,
  linesByFile: new Map(),
};

/**
 * Attributes authorship from the commit history.
 *
 * Returns an empty report when the directory is not a repository or git is
 * unavailable, which degrades hibi calibration without breaking it
 */
export async function readAuthorship(
  repoRoot: string,
): Promise<AuthorshipReport> {
  const email = await gitOutput(repoRoot, ["config", "user.email"]);
  if (email === null) return EMPTY;

  const authors = await gitOutput(repoRoot, [
    "log",
    `--max-count=${NUMSTAT_COMMIT_LIMIT}`,
    "--format=%ae",
  ]);
  if (authors === null) return EMPTY;

  const log = await gitOutput(repoRoot, [
    "log",
    `--max-count=${NUMSTAT_COMMIT_LIMIT}`,
    "--numstat",
    "--format=%x00%ae",
    "--no-renames",
  ]);
  if (log === null) return EMPTY;

  const me = email.trim().toLowerCase();
  return {
    hasGit: true,
    singleAuthor: isSingleAuthor(authors),
    linesByFile: parseNumstat(log, me),
  };
}

function isSingleAuthor(log: string): boolean {
  const counts = new Map<string, number>();

  for (const line of log.split("\n")) {
    const author = line.trim().toLowerCase();
    if (author.length === 0) continue;
    counts.set(author, (counts.get(author) ?? 0) + 1);
  }

  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (total === 0) return false;

  return Math.max(...counts.values()) / total >= 0.9;
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
function parseNumstat(log: string, me: string): Map<string, number> {
  const linesByFile = new Map<string, number>();

  for (const chunk of log.split("\u0000")) {
    const lines = chunk.split("\n");
    const author = lines.shift()?.trim().toLowerCase() ?? "";
    if (author !== me) continue;

    for (const line of lines) {
      const parts = line.split("\t");
      if (parts.length !== 3) continue;

      const added = Number.parseInt(parts[0] ?? "", 10);
      const path = parts[2] ?? "";
      if (Number.isNaN(added) || path.length === 0) continue;

      linesByFile.set(path, (linesByFile.get(path) ?? 0) + added);
    }
  }

  return linesByFile;
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
