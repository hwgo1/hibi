import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, parse } from "node:path";

import {
  FakeProvider,
  StorageLocal,
  type CompletionEvent,
  type SessionId,
} from "@hibi/core";

import { Daemon, type Client } from "../src/daemon";
import type { ServerEvent } from "../src/protocol";

interface TestClient extends Client {
  events: ServerEvent[];
}

function client(): TestClient {
  const events: ServerEvent[] = [];
  return { events, send: (event) => events.push(event) };
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

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

function daemon(...script: CompletionEvent[][]): Daemon {
  return new Daemon({ provider: new FakeProvider(script), home });
}

describe("Daemon spaces", () => {
  test("two folders become two spaces, and a turn reaches only its own", async () => {
    const d = daemon(reply("hello from a"));
    const a = client();
    const b = client();

    await d.handle({ type: "open_space", root: repoA }, a);
    await d.handle({ type: "open_space", root: repoB }, b);
    expect(spaceOf(a)?.id).not.toBe(spaceOf(b)?.id);

    await d.handle({ type: "message", text: "hi" }, a);

    expect(texts(a)).toEqual(["hello from a"]);
    expect(texts(b)).toEqual([]);
  });

  test("clients on the same folder share one space and see each other's turns", async () => {
    const d = daemon(reply("shared"));
    const terminal = client();
    const panel = client();

    await d.handle({ type: "open_space", root: repoA }, terminal);
    await d.handle({ type: "open_space", root: repoA }, panel);
    expect(spaceOf(terminal)?.id).toBe(spaceOf(panel)?.id);

    await d.handle({ type: "message", text: "hi" }, terminal);

    expect(texts(panel)).toEqual(["shared"]);
  });

  test("each space keeps its own session, and a new daemon resumes it", async () => {
    const first = daemon(reply("one"), reply("two"));
    const a = client();
    const b = client();

    await first.handle({ type: "open_space", root: repoA }, a);
    await first.handle({ type: "open_space", root: repoB }, b);
    await first.handle({ type: "message", text: "x" }, a);
    await first.handle({ type: "message", text: "y" }, a);
    await first.handle({ type: "message", text: "z" }, b);

    const storage = new StorageLocal(home);
    const sessionA = await storage.loadSession(spaceOf(a)!.id as SessionId);
    const sessionB = await storage.loadSession(spaceOf(b)!.id as SessionId);
    expect(sessionA?.turnCount).toBe(2);
    expect(sessionB?.turnCount).toBe(1);

    const again = client();
    const second = daemon();
    await second.handle({ type: "open_space", root: repoA }, again);
    await second.handle({ type: "state" }, again);

    const state = again.events.find((event) => event.type === "state");
    expect(state?.type === "state" && state.payload).toMatchObject({
      turnCount: 2,
    });
  });

  test("a detached client stops receiving its space's turns", async () => {
    const d = daemon(reply("after"));
    const gone = client();
    const stays = client();

    await d.handle({ type: "open_space", root: repoA }, gone);
    await d.handle({ type: "open_space", root: repoA }, stays);
    d.detach(gone);
    await d.handle({ type: "message", text: "hi" }, stays);

    expect(texts(gone)).toEqual([]);
    expect(texts(stays)).toEqual(["after"]);
  });
});

describe("Daemon refusals", () => {
  test("space requests wait for open_space", async () => {
    const c = client();
    await daemon().handle({ type: "message", text: "hi" }, c);

    expect(c.events[0]).toEqual({
      type: "error",
      message: "no space is open: send open_space first",
    });
  });

  test.each([
    ["the home directory", () => homedir()],
    ["a filesystem root", () => parse(base).root],
    ["a missing folder", () => join(base, "missing")],
  ])("refuses %s as a space root", async (_, root) => {
    const c = client();
    await daemon().handle({ type: "open_space", root: root() }, c);

    expect(c.events[0]?.type).toBe("error");
    expect(spaceOf(c)).toBeUndefined();
  });
});
