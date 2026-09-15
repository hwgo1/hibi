import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  appendFile,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";

import type { ConceptRegistry } from "../concepts";
import { ConceptRegistrySchema } from "../concepts";
import type { SessionId, UserId } from "../ids";
import type { EvidenceQuery, Storage } from "../ports/storage";
import type { EvidenceEvent } from "../schemas/evidence";
import { EvidenceEventSchema } from "../schemas/evidence";
import type { LearnerModel } from "../schemas/learner";
import { LearnerModelSchema } from "../schemas/learner";
import type { RepoModel } from "../schemas/repo";
import { RepoModelSchema } from "../schemas/repo";
import type { SessionState } from "../schemas/session";
import { SessionStateSchema } from "../schemas/session";

/**
 * File system layout under the hibi home directory.
 *
 * Learner model, concept registry and evidence are per use and shared by every repository,
 * so knowledge carrie across projects. Session and repo model are per repository,
 * keyed by a hash of its absolute path
 */
const LAYOUT = {
  profile: "profile.json",
  concepts: "concepts.json",
  evidence: "evidence.jsonl",
  repos: "repos",
} as const;

function repoKey(repoRoot: string): string {
  return createHash("sha256").update(repoRoot).digest("hex").slice(0, 16);
}

/**
 * Writes through a temporary file and renames into place. `rename` is atomic on POSIX and on Windows
 * within the same volume, so a reader sees either the complete previous file r the complete new one.
 * A plain write can be cut mid-flush and leave truncated JSON, which fails to parse and cannot be recovered.
 */
async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  try {
    await rename(tmp, path);
  } catch (error) {
    await unlink(tmp).catch(() => {});
    throw error;
  }
}

/**
 * Advisory lock over a lockfile, guarding read-modify-write cycles on the
 * per-user files that two daemons in different repositories share. Evidence
 * needs no lock: single-line appends do not interleave.
 *
 * `wx` fails when the file already exists, which makes creation the atomic
 * test-and-set. A stale lock left by a crashed process is broken after the
 * timeout rather than deadlocking
 */
const LOCK_TIMEOUT_MS = 10_000;
const LOCK_RETRY_MS = 50;

async function withLock<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
  await mkdir(dirname(lockPath), { recursive: true });
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  for (;;) {
    try {
      const handle = await open(lockPath, "wx");
      await handle.writeFile(String(process.pid));
      await handle.close();
      break;
    } catch {
      if (Date.now() > deadline) {
        await rm(lockPath, { force: true });
        continue;
      }
      await new Promise((r) => setTimeout(r, LOCK_RETRY_MS));
    }
  }

  try {
    return await fn();
  } finally {
    await rm(lockPath, { force: true });
  }
}

/**
 * Reads and validates. A missing file is a normal state and returns null;
 * malformed content is not silently discarded, since losing a learner model without notice
 * is worse than failing loudly
 */
async function readJson<T>(
  path: string,
  parse: (raw: unknown) => T,
): Promise<T | null> {
  let text: string;

  try {
    text = await readFile(path, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }

  return parse(JSON.parse(text));
}

export class StorageLocal implements Storage {
  constructor(private readonly home: string = join(homedir(), ".hibi")) {}

  private profilePath(): string {
    return join(this.home, LAYOUT.profile);
  }

  private conceptsPath(): string {
    return join(this.home, LAYOUT.concepts);
  }

  private evidencePath(): string {
    return join(this.home, LAYOUT.evidence);
  }

  private repoDir(repoRoot: string): string {
    return join(this.home, LAYOUT.repos, repoKey(repoRoot));
  }

  async loadLearnerModel(_userId: UserId): Promise<LearnerModel | null> {
    return readJson(this.profilePath(), (raw) => LearnerModelSchema.parse(raw));
  }

  async saveLearnerModel(model: LearnerModel): Promise<void> {
    await withLock(`${this.profilePath()}.lock`, () =>
      writeJsonAtomic(this.profilePath(), model),
    );
  }

  async loadConceptRegistry(_userId: UserId): Promise<ConceptRegistry | null> {
    return readJson(this.conceptsPath(), (raw) =>
      ConceptRegistrySchema.parse(raw),
    );
  }

  async saveConceptRegistry(
    _userId: UserId,
    registry: ConceptRegistry,
  ): Promise<void> {
    await withLock(`${this.conceptsPath()}.lock`, () =>
      writeJsonAtomic(this.conceptsPath(), registry),
    );
  }

  async loadSession(sessionId: SessionId): Promise<SessionState | null> {
    const index = await this.readSessionIndex();
    const repoRoot = index[sessionId];
    if (repoRoot === undefined) return null;
    return readJson(join(this.repoDir(repoRoot), "session.json"), (raw) =>
      SessionStateSchema.parse(raw),
    );
  }

  async saveSession(state: SessionState): Promise<void> {
    const dir = this.repoDir(state.repoRoot);
    await writeJsonAtomic(join(dir, "session.json"), state);
    await this.indexSession(state.sessionId, state.repoRoot);
  }

  async loadRepoModel(repoRoot: string): Promise<RepoModel | null> {
    return readJson(join(this.repoDir(repoRoot), "repo.json"), (raw) =>
      RepoModelSchema.parse(raw),
    );
  }

  async saveRepoModel(model: RepoModel): Promise<void> {
    await writeJsonAtomic(
      join(this.repoDir(model.repoRoot), "repo.json"),
      model,
    );
  }

  private sessionIndexPath(): string {
    return join(this.home, LAYOUT.repos, "index.json");
  }

  /** Maps session id to repo root, since sessions are stored under the repo */
  private async readSessionIndex(): Promise<Record<string, string>> {
    const raw = await readJson(
      this.sessionIndexPath(),
      (v) => v as Record<string, string>,
    );
    return raw ?? {};
  }

  private async indexSession(
    sessionId: SessionId,
    repoRoot: string,
  ): Promise<void> {
    await withLock(`${this.sessionIndexPath()}.lock`, async () => {
      const index = await this.readSessionIndex();
      index[sessionId] = repoRoot;
      await writeJsonAtomic(this.sessionIndexPath(), index);
    });
  }

  /** Single-line append */
  async appendEvidence(event: EvidenceEvent): Promise<void> {
    await mkdir(this.home, { recursive: true });
    await appendFile(
      this.evidencePath(),
      `${JSON.stringify(event)}\n`,
      "utf-8",
    );
  }

  /** Reads the whole log and filters in memory. Acceptable while the log is small */
  async queryEvidence(query: EvidenceQuery): Promise<EvidenceEvent[]> {
    let text: string;
    try {
      text = await readFile(this.evidencePath(), "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }

    const events: EvidenceEvent[] = [];
    for (const line of text.split("\n")) {
      if (line.trim().length === 0) continue;
      const parsed = EvidenceEventSchema.safeParse(JSON.parse(line));
      if (!parsed.success) continue;
      const event = parsed.data;
      if (event.userId !== query.userId) continue;
      if (query.conceptId !== undefined && event.conceptId !== query.conceptId)
        continue;
      if (query.since !== undefined && event.at < query.since) continue;
      events.push(event);
    }

    events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    return query.limit === undefined ? events : events.slice(-query.limit);
  }
}
