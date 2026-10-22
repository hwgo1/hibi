import { watch, type FSWatcher } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join, posix } from "node:path";

import { IGNORED_DIRS, MANIFEST_PARSERS, walkFiles } from "@hibi/core";

export type ChangeKind = "structure" | "edit";

/**
 * What a change under a space's root means. `structure`: the branch moved or
 * a manifest changed, so the model is stale now. `edit`: a file was saved.
 * Ignored and hidden directories mean nothing. `path` is root-relative with
 * forward slashes
 */
export function classifyChange(path: string): ChangeKind | null {
  if (
    path === ".git/HEAD" ||
    path === ".git/packed-refs" ||
    path.startsWith(".git/refs/heads/")
  ) {
    return "structure";
  }

  const segments = path.split("/");
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment.startsWith(".") ||
        IGNORED_DIRS.has(segment),
    )
  ) {
    return null;
  }

  return MANIFEST_PARSERS[segments.at(-1)!] !== undefined ? "structure" : "edit";
}

export interface WatchHandlers {
  /** The model may be stale: index the space again */
  reindex(): void;
  /** The file at `path` was saved */
  edited(path: string): void;
}

export interface WatchTiming {
  /** Wait after a structural change, so a checkout lands as one reindex */
  structureMs: number;
  /** Editors write a file several times per save */
  editMs: number;
  /** New files and uncommitted lines reach the model once editing pauses */
  quietMs: number;
  pollMs: number;
}

export const WATCH_TIMING: WatchTiming = {
  structureMs: 500,
  editMs: 300,
  quietMs: 30_000,
  pollMs: 3_000,
};

export interface SpaceWatcher {
  close(): void;
}

/**
 * Watches a space's root recursively. Where the system cannot, or runs out of
 * watches, the root is polled instead.
 *
 * shortcut: on Linux a recursive watch costs one inotify watch per
 * directory, ignored ones included; a tree past the limit falls back to
 * polling rather than pruning `node_modules` from the watch
 */
export function watchSpace(
  root: string,
  handlers: WatchHandlers,
  options: { poll?: boolean; timing?: Partial<WatchTiming> } = {},
): SpaceWatcher {
  const timing = { ...WATCH_TIMING, ...options.timing };
  const edits = new Map<string, ReturnType<typeof setTimeout>>();
  let reindex: ReturnType<typeof setTimeout> | undefined;
  /** The pending reindex follows a structural change and must not wait for editing to pause */
  let urgent = false;
  let source: SpaceWatcher | undefined;
  let closed = false;

  const reindexAfter = (ms: number) => {
    clearTimeout(reindex);
    reindex = setTimeout(() => {
      reindex = undefined;
      urgent = false;
      handlers.reindex();
    }, ms);
  };

  const changed = (path: string | null) => {
    if (closed) return;
    const kind = path === null ? "edit" : classifyChange(path);
    if (kind === null) return;

    if (kind === "structure") {
      urgent = true;
      reindexAfter(timing.structureMs);
      return;
    }
    if (!urgent) reindexAfter(timing.quietMs);
    if (path === null) return;

    clearTimeout(edits.get(path));
    edits.set(
      path,
      setTimeout(() => {
        edits.delete(path);
        void isFile(join(root, path)).then((file) => {
          if (file && !closed) handlers.edited(path);
        });
      }, timing.editMs),
    );
  };

  const poll = () => {
    if (!closed) source = pollRoot(root, changed, timing.pollMs);
  };

  if (options.poll === true) {
    poll();
  } else {
    try {
      const native: FSWatcher = watch(root, { recursive: true }, (_, name) =>
        changed(name == null ? null : name.toString().replaceAll("\\", "/")),
      );
      native.on("error", () => {
        native.close();
        poll();
      });
      source = native;
    } catch {
      poll();
    }
  }

  return {
    close() {
      closed = true;
      source?.close();
      clearTimeout(reindex);
      for (const timer of edits.values()) clearTimeout(timer);
      edits.clear();
    },
  };
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

type Snapshot = Map<string, number>;

/** Compares modification times on an interval and reports what differs */
function pollRoot(
  root: string,
  changed: (path: string) => void,
  intervalMs: number,
): SpaceWatcher {
  let previous: Snapshot | null = null;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const current = await snapshot(root);
      if (previous !== null) {
        for (const [path, mtime] of current) {
          if (previous.get(path) !== mtime) changed(path);
        }
        for (const path of previous.keys()) {
          if (!current.has(path)) changed(path);
        }
      }
      previous = current;
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  return { close: () => clearInterval(timer) };
}

const POLLED_FILES = 20_000;

async function snapshot(root: string): Promise<Snapshot> {
  const times: Snapshot = new Map();
  const record = async (path: string, absolute: string) => {
    try {
      times.set(path, (await stat(absolute)).mtimeMs);
    } catch {
      // gone between the listing and the stat; the next tick sees it missing
    }
  };

  for await (const file of walkFiles(root)) {
    await record(file.path, file.absolute);
    if (times.size >= POLLED_FILES) break;
  }

  await record(".git/HEAD", join(root, ".git", "HEAD"));
  await record(".git/packed-refs", join(root, ".git", "packed-refs"));
  const branch = await currentBranchRef(root);
  if (branch !== null) await record(branch, join(root, branch));

  return times;
}

/** `.git/refs/heads/<branch>` when HEAD names a branch, which moves on every commit */
async function currentBranchRef(root: string): Promise<string | null> {
  try {
    const head = await readFile(join(root, ".git", "HEAD"), "utf8");
    const ref = /^ref: (refs\/heads\/\S+)/.exec(head)?.[1];
    return ref === undefined ? null : posix.join(".git", ref);
  } catch {
    return null;
  }
}
