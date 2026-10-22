import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  decodeLines,
  encode,
  socketPath,
  type ClientRequest,
  type ServerEvent,
} from "@hibi/daemon";

import { DaemonClient, DaemonLostError } from "../src/client";

type Respond = (
  request: ClientRequest,
  write: (event: ServerEvent) => void,
  socket: Socket,
) => void;

let home = "";
let path = "";
const servers: Server[] = [];

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "hibi-client-"));
  path = socketPath(home);
  await mkdir(join(home, "run"));
});

afterEach(async () => {
  for (const server of servers.splice(0)) server.close();
  await rm(home, { recursive: true, force: true });
});

/** A stand-in daemon that opens any space and hands every other request to `respond` */
function fakeDaemon(respond: Respond, seen: ClientRequest[] = []): Promise<Server> {
  const server = createServer((socket) => {
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const { messages, rest } = decodeLines(buffer);
      buffer = rest;

      for (const raw of messages) {
        const request = raw as ClientRequest;
        seen.push(request);
        const write = (event: ServerEvent) => socket.write(encode(event));

        if (request.type === "open_space") {
          write({ type: "space", id: "s1", root: request.root, requestId: request.id });
          write({ type: "done", requestId: request.id });
        } else {
          respond(request, write, socket);
        }
      }
    });
  });

  servers.push(server);
  return new Promise((resolve) => server.listen(path, () => resolve(server)));
}

function client(start: () => void = () => {}): DaemonClient {
  return new DaemonClient({ path, root: "/work/app", start });
}

describe("DaemonClient", () => {
  test("a request resolves on its own done and leaves other requests' events to the handler", async () => {
    await fakeDaemon((request, write) => {
      write({ type: "text", text: "someone else", requestId: "other" });
      write({ type: "text", text: "mine", requestId: request.id });
      write({ type: "done", requestId: request.id });
    });

    const c = client();
    const foreign: string[] = [];
    const mine: string[] = [];
    c.onEvent((event) => {
      if (event.type === "text") foreign.push(event.text);
    });

    await c.request({ type: "message", text: "hi" }, (event) => {
      if (event.type === "text") mine.push(event.text);
    });

    expect(mine).toEqual(["mine"]);
    expect(foreign).toEqual(["someone else"]);
    c.close();
  });

  test("a waiting request fails at once when the daemon goes away", async () => {
    await fakeDaemon((_, __, socket) => socket.destroy());

    const c = client();
    await expect(c.request({ type: "message", text: "hi" })).rejects.toBeInstanceOf(
      DaemonLostError,
    );
  });

  test("the next request starts a daemon and reopens the space", async () => {
    const first = await fakeDaemon((_, __, socket) => socket.destroy());
    const seen: ClientRequest[] = [];
    let starts = 0;

    const c = client(() => {
      starts += 1;
      void fakeDaemon((request, write) => {
        write({ type: "done", requestId: request.id });
      }, seen);
    });

    await c.request({ type: "state" }).catch(() => undefined);
    await new Promise<void>((resolve) => first.close(() => resolve()));

    await c.request({ type: "state" });

    expect(starts).toBe(1);
    expect(seen.map((request) => request.type)).toEqual(["open_space", "state"]);
    c.close();
  });

  test("a refused folder is reported and the connection closed", async () => {
    const server = createServer((socket) => {
      socket.on("data", (chunk) => {
        const [request] = decodeLines(chunk.toString()).messages as ClientRequest[];
        socket.write(
          encode({ type: "error", message: "not a project folder", requestId: request!.id }),
        );
        socket.write(encode({ type: "done", requestId: request!.id }));
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(path, () => resolve()));

    expect(await client().open()).toBe("not a project folder");
  });
});
