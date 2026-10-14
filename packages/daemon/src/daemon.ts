import { createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  indexRepo,
  newSessionState,
  StorageLocal,
  systemClock,
  TeachingPreferencesSchema,
  TutorSession,
  WorkspaceFs,
  type Clock,
  type CommandOutcome,
  type LLMProvider,
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
import { TurnQueue } from "./turn-queue";

const LOCAL_USER = "local" as UserId;

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
  private readonly queue = new TurnQueue();
  private readonly clients = new Set<Socket>();
  private readonly home: string;
  private readonly clock: Clock;

  private server: Server | null = null;
  private tutor: TutorSession | null = null;
  private lockPath: string | null = null;

  constructor(private readonly options: DaemonOptions) {
    this.home = options.home ?? join(homedir(), ".hibi");
    this.clock = options.clock ?? systemClock;
    this.storage = new StorageLocal(this.home);
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

    this.tutor = new TutorSession(
      {
        provider: this.options.provider,
        storage: this.storage,
        workspace: new WorkspaceFs(this.options.repoRoot),
        clock: this.clock,
      },
      await this.loadSession(),
    );
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

  private async loadSession(): Promise<SessionState> {
    const id = repoKey(this.options.repoRoot) as SessionId;
    const existing = await this.storage.loadSession(id);
    return (
      existing ??
      newSessionState(id, LOCAL_USER, this.options.repoRoot, this.clock.now())
    );
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
          this.reply(socket, { type: "error", message: "malformed request" });
          continue;
        }
        void this.handle(parsed.data, socket);
      }
    });

    socket.on("close", () => this.clients.delete(socket));
    socket.on("error", () => this.clients.delete(socket));
  }

  private async handle(request: ClientRequest, socket: Socket): Promise<void> {
    switch (request.type) {
      case "state":
        this.reply(socket, { type: "state", payload: this.tutor?.session });
        return;

      case "profile": {
        const learner = await this.storage.loadLearnerModel(LOCAL_USER);
        this.reply(socket, { type: "profile", payload: learner });
        return;
      }

      case "signals": {
        const learner = await this.storage.loadLearnerModel(LOCAL_USER);
        this.reply(socket, {
          type: "signals",
          payload: learner?.inferredSignals ?? [],
        });
        return;
      }

      case "set_preference":
        await this.setPreference(request.key, request.value, socket);
        return;

      case "undo":
        await this.command(socket, (tutor) => tutor.undo());
        return;

      case "forget":
        await this.command(socket, (tutor) => {
          if (request.scope === "all") return tutor.forgetAll();
          if (request.value === undefined) {
            return Promise.resolve({ ok: false, message: "which concept?" });
          }
          return tutor.forget(request.value);
        });
        return;

      case "clear":
        this.tutor?.clearTranscript();
        this.reply(socket, { type: "ok", message: "conversation cleared" });
        return;

      case "reindex":
        await this.reindex(socket);
        return;

      case "shutdown":
        socket.write(encode({ type: "turn_end" }));
        await this.stop();
        return;

      case "message":
        await this.queue.run(() => this.runTurn(request.text));
        return;
    }
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

  /** Runs a state-changing command in turn order, so it never interleaves with a turn */
  private async command(
    socket: Socket,
    run: (tutor: TutorSession) => Promise<CommandOutcome>,
  ): Promise<void> {
    const tutor = this.tutor;
    if (tutor === null) return;
    const result = await this.queue.run(() => run(tutor));
    this.reply(socket, {
      type: result.ok ? "ok" : "error",
      message: result.message,
    });
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
    const tutor = this.tutor;
    if (tutor === null) return;

    try {
      for await (const event of tutor.turn(text)) {
        if (event.type === "text") {
          this.broadcast({ type: "text", text: event.text });
        } else if (event.type === "tool") {
          this.broadcast({ type: "tool", name: event.name, args: event.args });
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

    const session = tutor.session;
    const active = session.items.find(
      (item) => item.id === session.activeItemId,
    );
    if (active?.ladder !== undefined) {
      this.broadcast({ type: "step", step: active.ladder.step });
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
