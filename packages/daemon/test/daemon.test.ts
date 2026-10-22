import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, parse } from "node:path";

import {
  FakeProvider,
  newSessionState,
  StorageLocal,
  type CompletionEvent,
  type ConceptId,
  type ItemId,
  type SessionId,
  type SessionState,
  type UserId,
} from "@hibi/core";

import { Daemon, repoKey, type Client, type DaemonRequest } from "../src/daemon";
import type { RequestBody, ServerEvent } from "../src/protocol";

interface TestClient extends Client {
  events: ServerEvent[];
}

function client(): TestClient {
  const events: ServerEvent[] = [];
  return { events, send: (event) => events.push(event) };
}

let counter = 0;
type Body = Exclude<RequestBody, { type: "shutdown" }>;

/** Sends a request under a fresh id and returns that id */
async function send(d: Daemon, c: Client, body: Body): Promise<string> {
  const id = `t${++counter}`;
  await d.handle({ ...body, id } as DaemonRequest, c);
  return id;
}

const reply = (text: string): CompletionEvent[] => [
  { type: "text_delta", text },
  { type: "done", stopReason: "end_turn" },
];

const texts = (c: TestClient) =>
  c.events.flatMap((event) => (event.type === "text" ? [event.text] : []));

const spaceOf = (c: TestClient) => {
  const event = c.events.find((e) => e.type === "space");
  return event?.type === "space" ? event : undefined;
};

const of = (c: TestClient, id: string) =>
  c.events.filter((event) => event.requestId === id);

let base = "";
let home = "";
let repoA = "";
let repoB = "";

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "hibi-daemon-"));
  home = join(base, "home");
  repoA = join(base, "a");
  repoB = join(base, "b");
  await Promise.all([mkdir(repoA), mkdir(repoB)]);
});

const running: Daemon[] = [];

afterEach(async () => {
  await Promise.all(running.splice(0).map((d) => d.close()));
  await rm(base, { recursive: true, force: true });
});

function daemon(...script: CompletionEvent[][]): Daemon {
  const d = new Daemon({ provider: new FakeProvider(script), home });
  running.push(d);
  return d;
}

describe("Daemon requests", () => {
  test("every event carries its request id, and each request ends with done", async () => {
    const d = daemon(reply("hello"));
    const c = client();

    const open = await send(d, c, { type: "open_space", root: repoA });
    const message = await send(d, c, { type: "message", text: "hi" });

    expect(of(c, open).map((e) => e.type)).toEqual(["space", "done"]);
    expect(of(c, message).at(-1)?.type).toBe("done");
    expect(of(c, message).every((e) => e.spaceId === spaceOf(c)?.id)).toBe(
      true,
    );
    expect(c.events.every((e) => e.requestId === open || e.requestId === message)).toBe(true);
  });

  test("answers a command with its outcome under the command's id", async () => {
    const d = daemon(reply("one"));
    const c = client();

    await send(d, c, { type: "open_space", root: repoA });
    await send(d, c, { type: "message", text: "hi" });
    const undo = await send(d, c, { type: "undo" });
    const again = await send(d, c, { type: "undo" });

    expect(of(c, undo)[0]).toMatchObject({ type: "ok" });
    expect(of(c, again)[0]).toMatchObject({
      type: "error",
      message: "nothing to undo",
    });
  });

  test("rejects an unknown preference without touching the profile", async () => {
    const c = client();
    const id = await send(daemon(), c, {
      type: "set_preference",
      key: "colour",
      value: "red",
    });

    expect(of(c, id).map((e) => e.type)).toEqual(["error", "done"]);
  });
});

describe("Daemon spaces", () => {
  test("two folders become two spaces, and a turn reaches only its own", async () => {
    const d = daemon(reply("hello from a"));
    const a = client();
    const b = client();

    await send(d, a, { type: "open_space", root: repoA });
    await send(d, b, { type: "open_space", root: repoB });
    expect(spaceOf(a)?.id).not.toBe(spaceOf(b)?.id);

    await send(d, a, { type: "message", text: "hi" });

    expect(texts(a)).toEqual(["hello from a"]);
    expect(texts(b)).toEqual([]);
  });

  test("clients on the same folder share one space and see each other's turns", async () => {
    const d = daemon(reply("shared"));
    const terminal = client();
    const panel = client();

    await send(d, terminal, { type: "open_space", root: repoA });
    await send(d, panel, { type: "open_space", root: repoA });
    expect(spaceOf(terminal)?.id).toBe(spaceOf(panel)?.id);

    const id = await send(d, terminal, { type: "message", text: "hi" });

    expect(texts(panel)).toEqual(["shared"]);
    expect(of(panel, id).at(-1)?.type).toBe("done");
  });

  test("each space keeps its own session, and a new daemon resumes it", async () => {
    const first = daemon(reply("one"), reply("two"));
    const a = client();
    const b = client();

    await send(first, a, { type: "open_space", root: repoA });
    await send(first, b, { type: "open_space", root: repoB });
    await send(first, a, { type: "message", text: "x" });
    await send(first, a, { type: "message", text: "y" });
    await send(first, b, { type: "message", text: "z" });

    const storage = new StorageLocal(home);
    const sessionA = await storage.loadSession(spaceOf(a)!.id as SessionId);
    const sessionB = await storage.loadSession(spaceOf(b)!.id as SessionId);
    expect(sessionA?.turnCount).toBe(2);
    expect(sessionB?.turnCount).toBe(1);

    const again = client();
    const second = daemon();
    await send(second, again, { type: "open_space", root: repoA });
    await send(second, again, { type: "state" });

    const state = again.events.find((event) => event.type === "state");
    expect(state?.type === "state" && state.payload).toMatchObject({
      turnCount: 2,
    });
  });

  test("a detached client stops receiving its space's turns", async () => {
    const d = daemon(reply("after"));
    const gone = client();
    const stays = client();

    await send(d, gone, { type: "open_space", root: repoA });
    await send(d, stays, { type: "open_space", root: repoA });
    d.detach(gone);
    await send(d, stays, { type: "message", text: "hi" });

    expect(texts(gone)).toEqual([]);
    expect(texts(stays)).toEqual(["after"]);
  });
});

describe("Daemon refusals", () => {
  test("space requests wait for open_space", async () => {
    const c = client();
    const id = await send(daemon(), c, { type: "message", text: "hi" });

    expect(of(c, id)).toEqual([
      {
        type: "error",
        message: "no space is open: send open_space first",
        requestId: id,
      },
      { type: "done", requestId: id },
    ]);
  });

  test.each([
    ["the home directory", () => homedir()],
    ["a filesystem root", () => parse(base).root],
    ["a missing folder", () => join(base, "missing")],
  ])("refuses %s as a space root", async (_, root) => {
    const c = client();
    await send(daemon(), c, { type: "open_space", root: root() });

    expect(c.events[0]?.type).toBe("error");
    expect(spaceOf(c)).toBeUndefined();
  });
});

describe("Daemon watching", () => {
  const timing = { structureMs: 40, editMs: 40, quietMs: 5_000 };

  function watched(): Daemon {
    const d = new Daemon({
      provider: new FakeProvider([]),
      home,
      watch: { timing },
    });
    running.push(d);
    return d;
  }

  async function until<T>(read: () => Promise<T>, ok: (value: T) => boolean): Promise<T> {
    const deadline = Date.now() + 3000;
    for (;;) {
      const value = await read();
      if (ok(value)) return value;
      if (Date.now() > deadline) throw new Error("timed out");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  test("go mod init in an empty folder reaches the model without /index", async () => {
    const root = await realpath(repoA);
    const d = watched();
    await send(d, client(), { type: "open_space", root });

    const storage = new StorageLocal(home);
    expect((await storage.loadRepoModel(root))?.subprojects[0]?.languages).toEqual([]);

    await writeFile(join(root, "go.mod"), "module example.com/chat\n\ngo 1.24\n");

    const model = await until(
      () => storage.loadRepoModel(root),
      (model) => model?.subprojects[0]?.languages[0] === "Go",
    );
    expect(model?.subprojects[0]?.languageVersion).toBe("1.24");
  });

  test("saving the exercise file counts toward the effort floor", async () => {
    const root = await realpath(repoA);
    const id = repoKey(root) as SessionId;
    const session = newSessionState(id, "local" as UserId, root, new Date());
    const at = new Date().toISOString();
    session.items.push({
      id: "itm1" as ItemId,
      kind: "exercise",
      conceptId: "goroutines" as ConceptId,
      statement: "start a goroutine",
      targetFile: "main.go",
      attempts: 0,
      edits: 0,
      createdAt: at,
      lastTouchedAt: at,
      status: "active",
    });
    session.activeItemId = "itm1" as ItemId;
    await new StorageLocal(home).saveSession(session);

    const d = watched();
    const c = client();
    await send(d, c, { type: "open_space", root });
    await new Promise((resolve) => setTimeout(resolve, 100));

    await writeFile(join(root, "main.go"), "package main\n");

    const edits = await until(
      async () => {
        const state = await send(d, c, { type: "state" });
        const event = of(c, state)[0];
        return event?.type === "state"
          ? (event.payload as SessionState).items[0]?.edits
          : 0;
      },
      (count) => count === 1,
    );
    expect(edits).toBe(1);
  });
});
