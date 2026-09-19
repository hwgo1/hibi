import { stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/**
 * Walks up from `start` looking for a `.git` entry so that every directory in
 * a project resolves to the same session. Without this, running from a
 * subdirectory would create a separate session with its own state.
 *
 * Falls back to `start` when no repository is found, which keeps hibi usable
 * in a plain folder
 */
export async function findRepoRoot(start: string): Promise<string> {
  let current = resolve(start);

  for (;;) {
    try {
      await stat(join(current, ".git"));
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) return resolve(start);
      current = parent;
    }
  }
}
