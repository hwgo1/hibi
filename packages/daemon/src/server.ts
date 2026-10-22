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

  const stop = async (): Promise<never> => {
    await releaseLock(lockPath);
    if (!WINDOWS) await rm(path, { force: true });
    process.exit(0);
  };

  const server = createServer((socket) => attach(daemon, socket, stop));
  await new Promise<void>((resolve) => server.listen(path, resolve));

  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}

function attach(daemon: Daemon, socket: Socket, stop: () => Promise<never>) {
  const client: Client = { send: (event) => socket.write(encode(event)) };
  socket.setNoDelay(true);
  let buffer = "";

  socket.on("data", (chunk) => {
    buffer += chunk.toString();
    const { messages, rest } = decodeLines<unknown>(buffer);
    buffer = rest;

    for (const raw of messages) {
      const parsed = ClientRequestSchema.safeParse(raw);
      if (!parsed.success) {
        client.send({ type: "error", message: "malformed request" });
        client.send({ type: "turn_end" });
        continue;
      }

      const request = parsed.data;
      if (request.type === "shutdown") {
        client.send({ type: "turn_end" });
        void stop();
        return;
      }

      daemon.handle(request, client).catch((error: unknown) => {
        client.send({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        });
        client.send({ type: "turn_end" });
      });
    }
  });

  socket.on("close", () => daemon.detach(client));
  socket.on("error", () => daemon.detach(client));
}
