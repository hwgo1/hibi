import { createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  computeMastery,
  EVIDENCE_EVENT_SCHEMA_VERSION,
  indexRepo,
  newSessionState,
  retractionNote,
  StorageLocal,
  systemClock,
  TeachingPreferencesSchema,
  TutorSession,
  WorkspaceFs,
  type Clock,
  type ConceptId,
  type EvidenceId,
  type LLMProvider,
  type ProviderMessage,
  type SessionId,
  type SessionState,
  type UserId,
} from "@hibi/core";

import { acquireLock, releaseLock } from "./lockfile";
import {
  ClientRequestSchema,
  decodeLines,
  encode,
  type ClientRequest,
  type ServerEvent,
} from "./protocol";
import { sweepStaleIntents } from "./staleness";
import { TurnQueue } from "./turn-queue";

const LOCAL_USER = "local" as UserId;

/** Transcript is kept in memory only: durable state lives in the session file. */
const TRANSCRIPT_CAP = 24;

/** Concept attached to retractions, which are bookkeeping rather than learning */
const SYSTEM_CONCEPT = "programming-fundamentals" as ConceptId;

export interface DaemonOptions {
  repoRoot: string;
  provider: LLMProvider;
  home?: string;
  clock?: Clock;
}

export function repoKey(repoRoot: string): string {
  return createHash("sha256").update(repoRoot).digest("hex").slice(0, 16);
}

export function socketPath(repoRoot: string, home: string): string {
  return join(home, "run", `${repoKey(repoRoot)}.sock`);
}

export class Daemon {
  private readonly storage: StorageLocal;
  private readonly tutor: TutorSession;
  private readonly queue = new TurnQueue();
  private readonly clients = new Set<Socket>();
  private readonly home: string;
  private readonly clock: Clock;

  private server: Server | null = null;
  private session: SessionState | null = null;
  private transcript: ProviderMessage[] = [];
  private lockPath: string | null = null;

  constructor(private readonly options: DaemonOptions) {
    this.home = options.home ?? join(homedir(), ".hibi");
    this.clock = options.clock ?? systemClock;
    this.storage = new StorageLocal(this.home);
    this.tutor = new TutorSession({
      provider: options.provider,
      storage: this.storage,
      workspace: new WorkspaceFs(options.repoRoot),
      clock: this.clock,
    });
  }

  async start(): Promise<void> {
    const runDir = join(this.home, "run");
    await mkdir(runDir, { recursive: true });

    this.lockPath = join(runDir, `${repoKey(this.options.repoRoot)}.lock`);
    if (!(await acquireLock(this.lockPath))) {
      throw new Error(
        `a hibi daemon is already running for ${this.options.repoRoot}`,
      );
    }

    this.session = await this.loadSession();
    await this.ensureIndexed();

    const path = socketPath(this.options.repoRoot, this.home);
    await rm(path, { force: true });

    this.server = createServer((socket) => this.attach(socket));
    await new Promise<void>((resolve) => this.server!.listen(path, resolve));

    process.on("SIGINT", () => void this.stop());
    process.on("SIGTERM", () => void this.stop());
  }

  async stop(): Promise<void> {
    if (this.lockPath !== null) await releaseLock(this.lockPath);
    await rm(socketPath(this.options.repoRoot, this.home), { force: true });
    process.exit(0);
  }

  /**
   * Loads the repository's session and flags intents that went cold while the
   * daemon was down, so the tutor can raise them on the next turn
   */
  private async loadSession(): Promise<SessionState> {
    const id = repoKey(this.options.repoRoot) as SessionId;
    const existing = await this.storage.loadSession(id);
    const now = this.clock.now();

    if (existing === null) {
      return newSessionState(id, LOCAL_USER, this.options.repoRoot, now);
    }

    if (sweepStaleIntents(existing, now) > 0) {
      await this.storage.saveSession(existing);
    }
    return existing;
  }

  /**
   * Indexes the repository when no model exists yet, so a first run needs no
   * separate command. Failure is not fatal: the tutor can still read files, it
   * just starts each session without a map.
   */
  private async ensureIndexed(): Promise<void> {
    if ((await this.storage.loadRepoModel(this.options.repoRoot)) !== null)
      return;

    try {
      const model = await indexRepo(this.options.repoRoot, this.clock.now());
      await this.storage.saveRepoModel(model);
    } catch {
      // leaves the repo model null; the prompt omits the <repo> block
    }
  }

  private attach(socket: Socket): void {
    this.clients.add(socket);
    socket.setNoDelay(true);
    let buffer = "";

    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const { messages, rest } = decodeLines<unknown>(buffer);
      buffer = rest;

      for (const raw of messages) {
        const parsed = ClientRequestSchema.safeParse(raw);
        if (!parsed.success) {
          socket.write(encode({ type: "error", message: "malformed request" }));
          socket.write(encode({ type: "turn_end" }));
          continue;
        }
        void this.handle(parsed.data, socket);
      }
    });

    socket.on("close", () => this.clients.delete(socket));
    socket.on("error", () => this.clients.delete(socket));
  }

  private async handle(request: ClientRequest, socket: Socket): Promise<void> {
    if (request.type === "state") {
      this.reply(socket, { type: "state", payload: this.session });
      return;
    }

    if (request.type === "profile") {
      const learner = await this.storage.loadLearnerModel(LOCAL_USER);
      this.reply(socket, { type: "profile", payload: learner });
      return;
    }

    if (request.type === "signals") {
      const learner = await this.storage.loadLearnerModel(LOCAL_USER);
      this.reply(socket, {
        type: "signals",
        payload: learner?.inferredSignals ?? [],
      });
      return;
    }

    if (request.type === "set_preference") {
      await this.setPreference(request.key, request.value, socket);
      return;
    }

    if (request.type === "undo") {
      await this.undoLastTurn(socket);
      return;
    }

    if (request.type === "forget") {
      await this.forget(request.scope, request.value, socket);
      return;
    }

    if (request.type === "clear") {
      this.transcript = [];
      this.reply(socket, { type: "ok", message: "conversation cleared" });
      return;
    }

    if (request.type === "reindex") {
      await this.reindex(socket);
      return;
    }

    if (request.type === "shutdown") {
      socket.write(encode({ type: "turn_end" }));
      await this.stop();
      return;
    }

    await this.queue.run(() => this.runTurn(request.text));
  }

  /**
   * Validates a single preference against the schema before writing, so an
   * unknown key or an invalid value is rejected
   */
  private async setPreference(
    key: string,
    value: string,
    socket: Socket,
  ): Promise<void> {
    const learner = await this.storage.loadLearnerModel(LOCAL_USER);

    if (learner === null) {
      this.reply(socket, { type: "error", message: "no profile yet" });
      return;
    }

    if (!Object.keys(learner.preferences).includes(key)) {
      this.reply(socket, {
        type: "error",
        message: `unknown preference: ${key}`,
      });
      return;
    }

    const parsed = TeachingPreferencesSchema.safeParse({
      ...learner.preferences,
      [key]: value,
    });

    if (!parsed.success) {
      this.reply(socket, {
        type: "error",
        message: `invalid value for ${key}: ${value}`,
      });
      return;
    }

    learner.preferences = parsed.data;
    learner.updatedAt = this.clock.now().toISOString();
    await this.storage.saveLearnerModel(learner);

    this.reply(socket, { type: "ok", message: `${key} = ${value}` });
  }

  private async undoLastTurn(socket: Socket): Promise<void> {
    if (this.session === null || this.session.turnCount === 0) {
      this.reply(socket, { type: "error", message: "nothing to undo" });
      return;
    }

    await this.appendRetraction(
      this.session.sessionId,
      this.session.turnCount,
      SYSTEM_CONCEPT,
    );

    this.transcript = this.transcript.slice(0, -2);
    await this.recomputeMastery();

    this.reply(socket, {
      type: "ok",
      message: `turn ${this.session.turnCount} retracted`,
    });
  }

  /** Retracts evidence for one concept, or removes the log entirely */
  private async forget(
    scope: "concept" | "all",
    value: string | undefined,
    socket: Socket,
  ): Promise<void> {
    if (scope === "all") {
      const count = await this.storage.countEvidence();
      await this.storage.clearEvidence();
      await this.recomputeMastery();

      this.reply(socket, {
        type: "ok",
        message: `removed ${count} events permanently`,
      });
      return;
    }

    if (value === undefined) {
      this.reply(socket, { type: "error", message: "which concept?" });
      return;
    }

    const conceptId = value as ConceptId;
    const events = await this.storage.queryEvidence({
      userId: LOCAL_USER,
      conceptId,
    });
    const turns = new Map<
      string,
      { sessionId: SessionId; turnIndex: number }
    >();

    for (const event of events) {
      turns.set(`${event.sessionId}:${event.turnIndex}`, {
        sessionId: event.sessionId,
        turnIndex: event.turnIndex,
      });
    }

    for (const turn of turns.values()) {
      await this.appendRetraction(turn.sessionId, turn.turnIndex, conceptId);
    }

    await this.recomputeMastery();
    this.reply(socket, {
      type: "ok",
      message: `retracted ${turns.size} turns on ${conceptId}`,
    });
  }

  private async appendRetraction(
    sessionId: SessionId,
    turnIndex: number,
    conceptId: ConceptId,
  ): Promise<void> {
    await this.storage.appendEvidence({
      schemaVersion: EVIDENCE_EVENT_SCHEMA_VERSION,
      id: `ev_${Math.random().toString(36).slice(2, 12)}` as EvidenceId,
      at: this.clock.now().toISOString(),
      userId: LOCAL_USER,
      sessionId,
      turnIndex,
      kind: "turn_retracted",
      conceptId,
      provenance: "system",
      confidence: 0,
      outcome: "n/a",
      note: retractionNote(turnIndex),
    });
  }

  /** Rebuilds mastery from the visible log after evidence changes */
  private async recomputeMastery(): Promise<void> {
    const learner = await this.storage.loadLearnerModel(LOCAL_USER);
    const registry = await this.storage.loadConceptRegistry(LOCAL_USER);
    if (learner === null || registry === null) return;

    const events = await this.storage.queryEvidence({ userId: LOCAL_USER });
    const now = this.clock.now();

    learner.mastery = computeMastery(registry, events, now);
    learner.updatedAt = now.toISOString();
    await this.storage.saveLearnerModel(learner);
  }

  /** Rebuilds the repository model on demand */
  private async reindex(socket: Socket): Promise<void> {
    try {
      const model = await indexRepo(this.options.repoRoot, this.clock.now());
      await this.storage.saveRepoModel(model);
      this.reply(socket, {
        type: "ok",
        message: `indexed ${model.fileStats.total} files, ${model.fileStats.user} yours`,
      });
    } catch (error) {
      this.reply(socket, {
        type: "error",
        message: `index failed: ${String(error)}`,
      });
    }
  }

  /**
   * Broadcasts to every attached client rather than replying to the sender:
   * the session is shared, so a turn started in the terminal must also reach
   * an editor panel watching the same daemon
   */
  private async runTurn(text: string): Promise<void> {
    if (this.session === null) return;
    let assistantText = "";

    try {
      for await (const event of this.tutor.turn(
        this.session,
        this.transcript,
        text,
      )) {
        if (event.type === "text") {
          assistantText += event.text;
          this.broadcast({ type: "text", text: event.text });
        } else if (event.type === "tool") {
          this.broadcast({ type: "tool", name: event.name });
        } else if (event.type === "usage") {
          this.broadcast({
            type: "usage",
            inputTokens: event.usage.inputTokens,
            cachedInputTokens: event.usage.cachedInputTokens ?? 0,
            outputTokens: event.usage.outputTokens,
            model: event.model,
          });
        } else {
          this.broadcast({ type: "error", message: event.message });
        }
      }
    } catch (error) {
      this.broadcast({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }

    this.transcript.push({ role: "user", content: text });
    this.transcript.push({ role: "assistant", content: assistantText });
    this.transcript = this.transcript.slice(-TRANSCRIPT_CAP);

    const active = this.session.intents.find(
      (i) => i.id === this.session?.activeIntentId,
    );
    if (active?.kind === "resolve") {
      this.broadcast({ type: "step", step: active.step });
    }

    this.broadcast({ type: "turn_end" });
  }

  /** Answers one client and closes the exchange. */
  private reply(socket: Socket, event: ServerEvent): void {
    socket.write(encode(event));
    socket.write(encode({ type: "turn_end" }));
  }

  private broadcast(event: ServerEvent): void {
    const line = encode(event);
    for (const socket of this.clients) {
      socket.write(line);
    }
  }
}
