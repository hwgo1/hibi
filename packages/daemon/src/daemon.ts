import { createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  newSessionState,
  StorageLocal,
  systemClock,
  TeachingPreferencesSchema,
  TutorSession,
  WorkspaceFs,
  type Clock,
  type LLMProvider,
  type ProviderMessage,
  type SessionId,
  type SessionState,
  type Storage,
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

/** Transcript is kept in memory only, durable state lives in the session file */
const TRANSCRIPT_CAP = 24;

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
  private readonly storage: Storage;
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

  private attach(socket: Socket): void {
    this.clients.add(socket);
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
      socket.write(encode({ type: "state", payload: this.session }));
      socket.write(encode({ type: "turn_end" }));
      return;
    }

    if (request.type === "profile") {
      const learner = await this.storage.loadLearnerModel(LOCAL_USER);
      socket.write(encode({ type: "profile", payload: learner }));
      socket.write(encode({ type: "turn_end" }));
      return;
    }

    if (request.type === "set_preference") {
      await this.setPreference(request.key, request.value, socket);
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
      socket.write(encode({ type: "error", message: "no profile yet" }));
      socket.write(encode({ type: "turn_end" }));
      return;
    }

    const candidate = { ...learner.preferences, [key]: value };
    const parsed = TeachingPreferencesSchema.safeParse(candidate);

    if (!parsed.success || !Object.keys(learner.preferences).includes(key)) {
      socket.write(
        encode({
          type: "error",
          message: `invalid preference: ${key}=${value}`,
        }),
      );
      socket.write(encode({ type: "turn_end" }));
      return;
    }

    learner.preferences = parsed.data;
    learner.updatedAt = this.clock.now().toISOString();
    await this.storage.saveLearnerModel(learner);

    socket.write(encode({ type: "ok", message: `${key} = ${value}` }));
    socket.write(encode({ type: "turn_end" }));
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

  private broadcast(event: ServerEvent): void {
    const line = encode(event);
    for (const socket of this.clients) {
      socket.write(line);
    }
  }
}
