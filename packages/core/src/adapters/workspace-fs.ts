import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";

import type {
  ActiveDocument,
  FileContent,
  FileEntry,
  ListFilesOptions,
  ListFilesResult,
  Workspace,
} from "../ports/workspace";
import { isSecretFile } from "../repo/ignore";
import { toRepoPath, walkFiles } from "../repo/walk";

/** Bounds what is loaded into memory; read_file pages the text above this layer */
const MAX_FILE_BYTES = 512 * 1024;

export function hashContent(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

export class WorkspaceFs implements Workspace {
  readonly root: string;
  private realRoot: Promise<string> | null = null;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private realRootPath(): Promise<string> {
    this.realRoot ??= realpath(this.root);
    return this.realRoot;
  }

  /**
   * Resolves a repo-relative path to the real file behind it, after links are
   * followed. Refuses anything outside the root, inside `.git`, or holding
   * secrets: nothing read here may carry credentials to a provider
   */
  private async resolveInside(path: string): Promise<string> {
    const root = await this.realRootPath();

    let real: string;
    try {
      real = await realpath(resolve(root, path));
    } catch {
      throw new Error(`no such file or directory: ${path}`);
    }

    if (real !== root && !real.startsWith(root + sep)) {
      throw new Error(`path escapes workspace root: ${path}`);
    }
    if (
      toRepoPath(root, real).split("/").includes(".git") ||
      isSecretFile(basename(real))
    ) {
      throw new Error(`${path} may hold secrets and is never read`);
    }

    return real;
  }

  async listFiles(options: ListFilesOptions): Promise<ListFilesResult> {
    const root = await this.realRootPath();
    const from =
      options.subpath === undefined
        ? root
        : await this.resolveInside(options.subpath);

    const entries: FileEntry[] = [];
    let skipping = options.cursor !== undefined;
    let truncated = false;

    for await (const file of walkFiles(root, from)) {
      if (skipping) {
        skipping = file.path !== options.cursor;
        continue;
      }
      if (entries.length >= options.limit) {
        truncated = true;
        break;
      }
      const info = await stat(file.absolute);
      entries.push({ path: file.path, bytes: info.size });
    }

    const last = entries.at(-1);
    return {
      entries,
      nextCursor: truncated && last !== undefined ? last.path : undefined,
      truncated,
    };
  }

  async readFile(path: string): Promise<FileContent> {
    const absolute = await this.resolveInside(path);
    const info = await stat(absolute);
    if (info.size > MAX_FILE_BYTES) {
      throw new Error(`file too large to read: ${path} (${info.size} bytes)`);
    }
    const text = await readFile(absolute, "utf-8");
    return {
      path: toRepoPath(await this.realRootPath(), absolute),
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
