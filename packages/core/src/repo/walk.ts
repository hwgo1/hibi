import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { IGNORED_DIRS, isSecretFile } from "./ignore";

export interface WalkedFile {
  /** Repo-relative, always with forward slashes */
  path: string;
  absolute: string;
  name: string;
}

/** The repo-relative form every stored path uses, with forward slashes on every platform */
export function toRepoPath(root: string, absolute: string): string {
  return relative(root, absolute).split(sep).join("/");
}

/**
 * Yields the files under `from` in a stable order. Ignored and hidden
 * directories, symbolic links and files that hold secrets are skipped.
 * Callers end the walk by breaking out of the loop.
 */
export async function* walkFiles(
  root: string,
  from: string = root,
): AsyncGenerator<WalkedFile> {
  let entries: Dirent[];
  try {
    entries = await readdir(from, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  for (const entry of entries) {
    const absolute = join(from, entry.name);

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      yield* walkFiles(root, absolute);
    } else if (entry.isFile() && !isSecretFile(entry.name)) {
      yield { path: toRepoPath(root, absolute), absolute, name: entry.name };
    }
  }
}
