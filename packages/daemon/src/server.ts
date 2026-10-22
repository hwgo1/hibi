import { mkdir, rm } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { join } from "node:path";

import { repoKey, type Client, type Daemon } from "./daemon";
import { acquireLock, releaseLock } from "./lockfile";
import { ClientRequestSchema, decodeLines, encode } from "./protocol";

const WINDOWS = process.platform === "win32";

/** Where clients reach the user's daemon: a named pipe on Windows, a Unix socket elsewhere */
export function socketPath(home: string): string {
  return WINDOWS
    ? `\\\\.\\pipe\\hibi-${repoKey(home)}`
    : join(home, "run", "hibi.sock");
}

/**
 * Puts the daemon on the user's socket. Fails while another daemon for the
 * same home is alive; `shutdown` from any client ends the process.
 */
export async function serve(daemon: Daemon, home: string): Promise<void> {
  const runDir = join(home, "run");
  await mkdir(runDir, { recursive: true });

  const lockPath = join(runDir, "daemon.lock");
  if (!(await acquireLock(lockPath))) {
    throw new Error("a hibi daemon is already running");
  }

  const path = socketPath(home);
  if (!WINDOWS) await rm(path, { force: true });

  const inflight = new Set<Promise<void>>();
  const lifecycle: Lifecycle = {
    track(work) {
      inflight.add(work);
      void work.finally(() => inflight.delete(work));
    },
    async stop(beforeExit) {
      await Promise.allSettled([...inflight]);
      await beforeExit?.();
      await releaseLock(lockPath);
      if (!WINDOWS) await rm(path, { force: true });
      process.exit(0);
    },
  };

  const server = createServer((socket) => attach(daemon, socket, lifecycle));
  await new Promise<void>((resolve) => server.listen(path, resolve));

  process.on("SIGINT", () => void lifecycle.stop());
  process.on("SIGTERM", () => void lifecycle.stop());
}

interface Lifecycle {
  /** Keeps the process alive until `work` settles */
  track(work: Promise<void>): void;
  /** Lets every request already received finish, then releases the socket and the lock and exits */
  stop(beforeExit?: () => Promise<void>): Promise<never>;
}

function attach(daemon: Daemon, socket: Socket, lifecycle: Lifecycle) {
  const client: Client = {
    send: (event) => {
      if (!socket.destroyed) socket.write(encode(event));
    },
  };
  socket.setNoDelay(true);
  let buffer = "";

  socket.on("data", (chunk) => {
    buffer += chunk.toString();
    const { messages, rest } = decodeLines(buffer);
    buffer = rest;

    for (const raw of messages) {
      const parsed = ClientRequestSchema.safeParse(raw);
      if (!parsed.success) {
        const requestId = idOf(raw);
        client.send({ type: "error", message: "malformed request", requestId });
        client.send({ type: "done", requestId });
        continue;
      }

      const request = parsed.data;
      if (request.type === "shutdown") {
        const done = encode({ type: "done", requestId: request.id });
        void lifecycle.stop(
          () => new Promise((resolve) => socket.write(done, () => resolve())),
        );
        return;
      }

      lifecycle.track(daemon.handle(request, client));
    }
  });

  socket.on("close", () => daemon.detach(client));
  socket.on("error", () => daemon.detach(client));
}

/** The id of a request that failed validation, when it has a usable one, so the sender can still match the error */
function idOf(raw: unknown): string {
  const id = (raw as { id?: unknown } | null)?.id;
  return typeof id === "string" ? id : "";
}
