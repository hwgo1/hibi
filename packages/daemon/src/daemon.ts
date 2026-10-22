import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

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
  type UserId,
} from "@hibi/core";

import type { ClientRequest, Reply, ServerEvent } from "./protocol";
import { TurnQueue } from "./turn-queue";

const LOCAL_USER = "local" as UserId;

/** One attached connection, as the daemon sees it */
export interface Client {
  send(event: ServerEvent): void;
}

/** Everything but `shutdown`, which belongs to the transport that owns the process */
export type DaemonRequest = Exclude<ClientRequest, { type: "shutdown" }>;

type Answerable = Exclude<DaemonRequest, { type: "message" }>;

export interface DaemonOptions {
  provider: LLMProvider;
  home?: string;
  clock?: Clock;
}

interface Space {
  id: string;
  root: string;
  tutor: TutorSession;
  clients: Set<Client>;
}

const NO_SPACE: Reply = {
  type: "error",
  message: "no space is open: send open_space first",
};

export function repoKey(repoRoot: string): string {
  return createHash("sha256").update(repoRoot).digest("hex").slice(0, 16);
}

/**
 * Owns the user's state for every space at once. Requests that change state
 * run one at a time, because spaces share the learner, the concepts and the
 * log. Knows nothing about sockets, so it runs under test without one.
 */
export class Daemon {
  private readonly storage: StorageLocal;
  private readonly queue = new TurnQueue();
  private readonly clock: Clock;
  private readonly spaces = new Map<string, Promise<Space>>();
  private readonly attached = new Map<Client, Space>();

  constructor(private readonly options: DaemonOptions) {
    this.clock = options.clock ?? systemClock;
    this.storage = new StorageLocal(options.home ?? join(homedir(), ".hibi"));
  }

  /**
   * Every request ends with `done` under its id. A message's events go to
   * every client on the space; any other request is answered to its sender
   * only
   */
  async handle(request: DaemonRequest, client: Client): Promise<void> {
    if (request.type === "message") {
      const space = this.attached.get(client);
      if (space === undefined) {
        this.answer(client, request.id, [NO_SPACE]);
        return;
      }
      await this.queue.run(() => this.runTurn(space, request.id, request.text));
      return;
    }

    let replies: Reply[];
    try {
      replies = await this.dispatch(request, client);
    } catch (error) {
      replies = [{ type: "error", message: messageOf(error) }];
    }
    this.answer(client, request.id, replies);
  }

  /** Stops routing events to a connection that went away */
  detach(client: Client): void {
    this.attached.get(client)?.clients.delete(client);
    this.attached.delete(client);
  }

  private async dispatch(request: Answerable, client: Client): Promise<Reply[]> {
    switch (request.type) {
      case "open_space":
        return this.openSpace(request.root, client);

      case "profile":
        return [
          {
            type: "profile",
            payload: await this.storage.loadLearnerModel(LOCAL_USER),
          },
        ];

      case "signals": {
        const learner = await this.storage.loadLearnerModel(LOCAL_USER);
        return [{ type: "signals", payload: learner?.inferredSignals ?? [] }];
      }

      case "set_preference":
        return this.queue.run(() =>
          this.setPreference(request.key, request.value),
        );
    }

    const space = this.attached.get(client);
    if (space === undefined) return [NO_SPACE];

    switch (request.type) {
      case "state":
        return [{ type: "state", payload: space.tutor.session }];

      case "undo":
        return this.command(() => space.tutor.undo());

      case "forget":
        return this.command(() => {
          if (request.scope === "all") return space.tutor.forgetAll();
          if (request.value === undefined) {
            return Promise.resolve({ ok: false, message: "which concept?" });
          }
          return space.tutor.forget(request.value);
        });

      case "clear":
        return this.queue.run(async () => {
          space.tutor.clearTranscript();
          return [{ type: "ok", message: "conversation cleared" }];
        });

      case "reindex":
        return this.queue.run(() => this.reindex(space.root));
    }
  }

  private async openSpace(root: string, client: Client): Promise<Reply[]> {
    const absolute = resolve(root);
    const problem = await rootProblem(absolute);
    if (problem !== null) return [{ type: "error", message: problem }];

    const space = await this.loadSpace(absolute);
    this.detach(client);
    space.clients.add(client);
    this.attached.set(client, space);

    return [{ type: "space", id: space.id, root: space.root }];
  }

  /** Loads a space on first use. The promise is cached, so two clients opening the same root share one tutor */
  private loadSpace(root: string): Promise<Space> {
    const id = repoKey(root);
    let space = this.spaces.get(id);

    if (space === undefined) {
      space = this.createSpace(id, root);
      this.spaces.set(id, space);
      space.catch(() => this.spaces.delete(id));
    }
    return space;
  }

  private async createSpace(id: string, root: string): Promise<Space> {
    const session =
      (await this.storage.loadSession(id as SessionId)) ??
      newSessionState(id as SessionId, LOCAL_USER, root, this.clock.now());

    const tutor = new TutorSession(
      {
        provider: this.options.provider,
        storage: this.storage,
        workspace: new WorkspaceFs(root),
        clock: this.clock,
      },
      session,
    );

    await this.ensureIndexed(root);
    return { id, root, tutor, clients: new Set() };
  }

  /**
   * Indexes a root that has no model yet, so a first run needs no separate
   * command. Failure is not fatal: the tutor can still read files, it just
   * starts without a map.
   */
  private async ensureIndexed(root: string): Promise<void> {
    if ((await this.storage.loadRepoModel(root)) !== null) return;

    try {
      await this.storage.saveRepoModel(await indexRepo(root, this.clock.now()));
    } catch {
      // leaves the repo model null; the prompt omits the <repo> block
    }
  }

  /**
   * Validates a single preference against the schema before writing, so an
   * unknown key or an invalid value is rejected
   */
  private async setPreference(key: string, value: string): Promise<Reply[]> {
    const learner = await this.storage.loadLearnerModel(LOCAL_USER);
    if (learner === null) return [{ type: "error", message: "no profile yet" }];

    if (!Object.keys(learner.preferences).includes(key)) {
      return [{ type: "error", message: `unknown preference: ${key}` }];
    }

    const parsed = TeachingPreferencesSchema.safeParse({
      ...learner.preferences,
      [key]: value,
    });
    if (!parsed.success) {
      return [{ type: "error", message: `invalid value for ${key}: ${value}` }];
    }

    learner.preferences = parsed.data;
    learner.updatedAt = this.clock.now().toISOString();
    await this.storage.saveLearnerModel(learner);

    return [{ type: "ok", message: `${key} = ${value}` }];
  }

  /** Runs a state-changing command in turn order, so it never interleaves with a turn */
  private async command(run: () => Promise<CommandOutcome>): Promise<Reply[]> {
    const result = await this.queue.run(run);
    return [{ type: result.ok ? "ok" : "error", message: result.message }];
  }

  private async reindex(root: string): Promise<Reply[]> {
    try {
      const model = await indexRepo(root, this.clock.now());
      await this.storage.saveRepoModel(model);
      return [
        {
          type: "ok",
          message: `indexed ${model.fileStats.total} files, ${model.fileStats.user} yours`,
        },
      ];
    } catch (error) {
      return [{ type: "error", message: `index failed: ${messageOf(error)}` }];
    }
  }

  /**
   * Sends the turn to every client attached to the space, so a turn started
   * in the terminal also reaches an editor panel on the same space, and to
   * no one in other spaces
   */
  private async runTurn(
    space: Space,
    requestId: string,
    text: string,
  ): Promise<void> {
    const send = (reply: Reply) => {
      const event: ServerEvent = { ...reply, requestId, spaceId: space.id };
      for (const client of space.clients) client.send(event);
    };

    try {
      for await (const event of space.tutor.turn(text)) {
        if (event.type === "text") {
          send({ type: "text", text: event.text });
        } else if (event.type === "tool") {
          send({ type: "tool", name: event.name, args: event.args });
        } else if (event.type === "usage") {
          send({
            type: "usage",
            inputTokens: event.usage.inputTokens,
            cachedInputTokens: event.usage.cachedInputTokens ?? 0,
            outputTokens: event.usage.outputTokens,
            model: event.model,
          });
        } else {
          send({ type: "error", message: event.message });
        }
      }
    } catch (error) {
      send({ type: "error", message: messageOf(error) });
    }

    const session = space.tutor.session;
    const active = session.items.find(
      (item) => item.id === session.activeItemId,
    );
    if (active?.ladder !== undefined) {
      send({ type: "step", step: active.ladder.step });
    }

    send({ type: "done" });
  }

  private answer(client: Client, requestId: string, replies: Reply[]): void {
    for (const reply of replies) client.send({ ...reply, requestId });
    client.send({ type: "done", requestId });
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A space root must be a project folder. The home directory and a filesystem
 * root are refused: indexing either would walk everything the user owns
 */
async function rootProblem(root: string): Promise<string | null> {
  if (root === resolve(homedir()) || dirname(root) === root) {
    return `${root} is not a project folder; run hibi inside one`;
  }
  try {
    if (!(await stat(root)).isDirectory()) return `${root} is not a folder`;
  } catch {
    return `${root} does not exist`;
  }
  return null;
}
