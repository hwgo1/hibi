import { connect, type Socket } from "node:net";

import {
  decodeLines,
  encode,
  type ClientRequest,
  type RequestBody,
  type ServerEvent,
} from "@hibi/daemon";

export type EventHandler = (event: ServerEvent) => void;

interface Pending {
  listener?: EventHandler;
  resolve(): void;
  reject(error: Error): void;
}

const START_TIMEOUT_MS = 8000;
const START_POLL_MS = 100;

/** Raised to every waiting request when the daemon goes away; the next request reconnects */
export class DaemonLostError extends Error {
  constructor() {
    super("the daemon stopped");
    this.name = "DaemonLostError";
  }
}

export interface ClientOptions {
  path: string;
  /** Folder whose space this client works in; reopened after every reconnect */
  root: string;
  /** Launches a daemon. Called when none answers */
  start(): void;
}

/**
 * One connection to the user's daemon, bound to one space. Requests are
 * numbered, so each resolves on its own `done` whatever else arrives. When
 * the daemon goes away, waiting requests fail at once, and the next request
 * starts a daemon and reopens the space.
 */
export class DaemonClient {
  private socket: Socket | null = null;
  private opening: Promise<string | null> | null = null;
  private nextId = 1;
  private readonly pending = new Map<string, Pending>();
  private handler: EventHandler | null = null;

  constructor(private readonly options: ClientOptions) {}

  /** Connects, starting a daemon if needed, and opens the space. Resolves with the daemon's refusal of the folder, or null */
  open(): Promise<string | null> {
    this.opening ??= this.connectAndOpen().finally(() => {
      this.opening = null;
    });
    return this.opening;
  }

  /** Receives events that belong to no request of this client, such as a turn another client started on the space */
  onEvent(handler: EventHandler): void {
    this.handler = handler;
  }

  /** Sends one request and resolves on its `done`. Its other events reach `listener` */
  async request(body: RequestBody, listener?: EventHandler): Promise<void> {
    if (this.socket === null) {
      const refusal = await this.open();
      if (refusal !== null) throw new Error(refusal);
    }
    return this.send(body, listener);
  }

  close(): void {
    this.socket?.end();
  }

  private send(body: RequestBody, listener?: EventHandler): Promise<void> {
    const socket = this.socket;
    if (socket === null) return Promise.reject(new DaemonLostError());

    const id = `r${this.nextId++}`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { listener, resolve, reject });
      socket.write(encode({ ...body, id } as ClientRequest));
    });
  }

  private async connectAndOpen(): Promise<string | null> {
    this.socket = await this.connectOrStart();
    if (this.socket.destroyed) {
      this.socket = null;
      throw new DaemonLostError();
    }

    let refusal: string | null = null;
    await this.send({ type: "open_space", root: this.options.root }, (event) => {
      if (event.type === "error") refusal = event.message;
    });

    if (refusal !== null) this.close();
    return refusal;
  }

  private async connectOrStart(): Promise<Socket> {
    try {
      return await this.connect();
    } catch {
      this.options.start();
    }

    const deadline = Date.now() + START_TIMEOUT_MS;
    for (;;) {
      await Bun.sleep(START_POLL_MS);
      try {
        return await this.connect();
      } catch {
        if (Date.now() > deadline) {
          throw new Error("the daemon did not start in time");
        }
      }
    }
  }

  private connect(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = connect(this.options.path);
      socket.once("error", reject);
      socket.once("connect", () => {
        socket.off("error", reject);
        this.attach(socket);
        resolve(socket);
      });
    });
  }

  private attach(socket: Socket): void {
    let buffer = "";

    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const { messages, rest } = decodeLines(buffer);
      buffer = rest;
      for (const message of messages) this.dispatch(message as ServerEvent);
    });

    socket.on("close", () => this.lost(socket));
    socket.on("error", () => this.lost(socket));
  }

  private dispatch(event: ServerEvent): void {
    const pending = this.pending.get(event.requestId);

    if (pending === undefined) {
      this.handler?.(event);
    } else if (event.type === "done") {
      this.pending.delete(event.requestId);
      pending.resolve();
    } else {
      pending.listener?.(event);
    }
  }

  private lost(socket: Socket): void {
    if (this.socket !== socket) return;
    this.socket = null;

    const waiting = [...this.pending.values()];
    this.pending.clear();
    for (const request of waiting) request.reject(new DaemonLostError());
  }
}
