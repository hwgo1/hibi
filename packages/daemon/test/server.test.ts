import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { decodeLines, type ServerEvent } from "../src/protocol";
import { socketPath } from "../src/server";

const FIXTURE = join(import.meta.dir, "fixtures", "serve.ts");

let base = "";
let home = "";
let repo = "";

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "hibi-server-"));
  home = join(base, "home");
  repo = join(base, "repo");
  await mkdir(repo);
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

/** Starts the fixture daemon and resolves once it listens */
async function startDaemon() {
  const child = Bun.spawn([process.execPath, FIXTURE, home], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const reader = child.stdout.getReader();
  const { value } = await reader.read();
  reader.releaseLock();
  expect(new TextDecoder().decode(value)).toContain("listening");
  return child;
}

/** Writes raw lines and collects every event until the daemon closes the connection */
function exchange(lines: string[]): Promise<ServerEvent[]> {
  return new Promise((resolve, reject) => {
    const events: ServerEvent[] = [];
    let buffer = "";
    const socket = connect(socketPath(home), () => {
      socket.write(lines.map((line) => `${line}\n`).join(""));
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const { messages, rest } = decodeLines(buffer);
      buffer = rest;
      events.push(...(messages as ServerEvent[]));
    });
    socket.on("close", () => resolve(events));
    socket.on("error", reject);
  });
}

describe("serve", () => {
  test("answers over the socket, reports bad lines and stops on shutdown", async () => {
    const daemon = await startDaemon();

    const events = await exchange([
      "not json",
      JSON.stringify({ id: "r1", type: "open_space", root: repo }),
      JSON.stringify({ id: "r2", type: "nope" }),
      JSON.stringify({ id: "r3", type: "shutdown" }),
    ]);

    expect(events).toContainEqual({
      type: "error",
      message: "malformed request",
      requestId: "",
    });
    expect(events).toContainEqual({
      type: "error",
      message: "malformed request",
      requestId: "r2",
    });
    expect(events.find((e) => e.requestId === "r1")?.type).toBe("space");
    expect(events.at(-1)).toEqual({ type: "done", requestId: "r3" });

    expect(await daemon.exited).toBe(0);
    await expect(access(join(home, "run", "daemon.lock"))).rejects.toThrow();
  });

  test("a second daemon for the same home refuses to start", async () => {
    const first = await startDaemon();

    const second = Bun.spawn([process.execPath, FIXTURE, home], {
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await second.exited).toBe(1);
    expect(await new Response(second.stderr).text()).toContain(
      "already running",
    );

    first.kill();
    await first.exited;
  });

  test("a lock left by a dead daemon is taken over", async () => {
    const crashed = await startDaemon();
    crashed.kill(9);
    await crashed.exited;

    const next = await startDaemon();
    next.kill();
    await next.exited;
  });
});
