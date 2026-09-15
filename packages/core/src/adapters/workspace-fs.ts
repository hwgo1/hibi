import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

import type {
  ActiveDocument,
  FileContent,
  FileEntry,
  ListFilesOptions,
  ListFilesResult,
  Workspace,
} from "../ports/workspace";

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "target",
  ".next",
  ".venv",
  "__pycache__",
  ".cache",
  "coverage",
]);

/** Guards against reading a file large enough to blow context window */
const MAX_FILE_BYTES = 512 * 1024;

export function hashContent(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

export class WorkspaceFs implements Workspace {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  /** Rejects path escaping the workspace root */
  private resolveInside(path: string): string {
    const absolute = resolve(this.root, path);
    if (absolute !== this.root && !absolute.startsWith(this.root + sep)) {
      throw new Error(`path escapes workspace root: ${path}`);
    }

    return absolute;
  }

  async listFiles(options: ListFilesOptions): Promise<ListFilesResult> {
    const base =
      options.subpath === undefined
        ? this.root
        : this.resolveInside(options.subpath);

    const entries: FileEntry[] = [];
    let skipping = options.cursor !== undefined;
    let truncated = false;

    const walk = async (dir: string): Promise<void> => {
      if (entries.length >= options.limit) {
        truncated = true;
        return;
      }

      const children = await readdir(dir, { withFileTypes: true });
      children.sort((a, b) => (a.name < b.name ? -1 : 1));

      for (const child of children) {
        if (entries.length >= options.limit) {
          truncated = true;
          return;
        }
        if (child.name.startsWith(".") && child.isDirectory()) continue;
        if (child.isDirectory()) {
          if (IGNORED_DIRS.has(child.name)) continue;
          await walk(join(dir, child.name));
          continue;
        }
        if (!child.isFile()) continue;

        const absolute = join(dir, child.name);
        const rel = relative(this.root, absolute);

        if (skipping) {
          if (rel === options.cursor) skipping = false;
          continue;
        }

        const info = await stat(absolute);
        entries.push({ path: rel, bytes: info.size });
      }
    };

    await walk(base);

    const last = entries[entries.length - 1];
    return {
      entries,
      nextCursor: truncated && last !== undefined ? last.path : undefined,
      truncated,
    };
  }

  async readFile(path: string): Promise<FileContent> {
    const absolute = this.resolveInside(path);
    const info = await stat(absolute);
    if (info.size > MAX_FILE_BYTES) {
      throw new Error(`file too large to read: ${path} (${info.size} bytes)`);
    }
    const text = await readFile(absolute, "utf-8");
    return {
      path: relative(this.root, absolute),
      text,
      contentHash: hashContent(text),
      dirty: false,
    };
  }

  /** Always null: a CLI host has no editor attached */
  async activeDocument(): Promise<ActiveDocument | null> {
    return null;
  }
}
