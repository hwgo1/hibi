import { createHash } from "node:crypto";
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
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { ConceptRegistry } from "../concepts";
import { ConceptRegistrySchema } from "../concepts";
import type { SessionId, UserId } from "../ids";
import type { EvidenceQuery, Storage } from "../ports/storage";
import type { EvidenceEvent } from "../schemas/evidence";
import { applyRetractions, parseEvidenceLine } from "../schemas/evidence";
import type { LearnerModel } from "../schemas/learner";
import { LearnerModelSchema } from "../schemas/learner";
import type { RepoModel } from "../schemas/repo";
import { RepoModelSchema } from "../schemas/repo";
import type { SessionState } from "../schemas/session";
import { SessionStateSchema } from "../schemas/session";

/**
 * Filesystem layout under the hibi home directory.
 *
 * Learner model, concept registry and evidence are per user and shared by
 * every repository, so knowledge carries across projects. Session and repo
 * model are per repository, keyed by a hash of its absolute path.
 */
const LAYOUT = {
  profile: "profile.json",
  concepts: "concepts.json",
  evidence: "evidence.jsonl",
  repos: "repos",
} as const;

const LOCK_TIMEOUT_MS = 10_000;
const LOCK_RETRY_MS = 50;

function repoKey(repoRoot: string): string {
  return createHash("sha256").update(repoRoot).digest("hex").slice(0, 16);
}

/**
 * Writes through a temporary file and renames into place. `rename` is atomic
 * within a volume, so a reader sees either the complete previous file or the
 * complete new one, never truncated JSON.
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
 * Advisory lock guarding read-modify-write cycles on per-user files that
 * daemons in different repositories share. `wx` makes creation an atomic
 * test-and-set; a lock left by a crashed process is broken after the timeout.
 */
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
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
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
 * malformed content is not silently discarded, since losing a learner model
 * without notice is worse than failing loudly
 */
async function readJson<T>(
  path: string,
  parse: (raw: unknown) => T,
): Promise<T | null> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
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

  private sessionIndexPath(): string {
    return join(this.home, LAYOUT.repos, "index.json");
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
    await writeJsonAtomic(
      join(this.repoDir(state.repoRoot), "session.json"),
      state,
    );
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

  async appendEvidence(event: EvidenceEvent): Promise<void> {
    await mkdir(this.home, { recursive: true });
    await appendFile(this.evidencePath(), `${JSON.stringify(event)}\n`, "utf8");
  }

  async queryEvidence(query: EvidenceQuery): Promise<EvidenceEvent[]> {
    const stored = await this.readAllEvents();
    const visible = applyRetractions(stored);
    const matched: EvidenceEvent[] = [];

    for (const event of visible) {
      if (event.userId !== query.userId) continue;
      if (query.conceptId !== undefined && event.conceptId !== query.conceptId)
        continue;
      if (query.since !== undefined && event.at < query.since) continue;
      matched.push(event);
    }

    matched.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    return query.limit === undefined ? matched : matched.slice(-query.limit);
  }

  async clearEvidence(): Promise<void> {
    await rm(this.evidencePath(), { force: true });
  }

  async countEvidence(): Promise<number> {
    try {
      const text = await readFile(this.evidencePath(), "utf8");
      return text.split("\n").filter((line) => line.trim().length > 0).length;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
      throw error;
    }
  }

  private async readAllEvents(): Promise<EvidenceEvent[]> {
    let text: string;
    try {
      text = await readFile(this.evidencePath(), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }

    const events: EvidenceEvent[] = [];

    for (const line of text.split("\n")) {
      if (line.trim().length === 0) continue;

      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        continue;
      }

      const event = parseEvidenceLine(raw);
      if (event !== null) events.push(event);
    }

    return events;
  }

  /** Maps session id to repo root, since sessions are stored under the repo */
  private async readSessionIndex(): Promise<Record<string, string>> {
    const raw = await readJson(
      this.sessionIndexPath(),
      (value) => value as Record<string, string>,
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
}
