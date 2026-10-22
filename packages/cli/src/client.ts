import { connect, type Socket } from "node:net";

import {
  decodeLines,
  encode,
  type ClientRequest,
  type ServerEvent,
} from "@hibi/daemon";

export type EventHandler = (event: ServerEvent) => void;

export class DaemonClient {
  private socket: Socket | null = null;
  private buffer = "";
  private handler: EventHandler | null = null;

  async connect(path: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = connect(path);

      socket.once("connect", () => {
        this.socket = socket;
        resolve();
      });
      socket.once("error", reject);

      socket.on("data", (chunk) => {
        this.buffer += chunk.toString();
        const { messages, rest } = decodeLines<ServerEvent>(this.buffer);
        this.buffer = rest;
        for (const message of messages) this.handler?.(message);
      });
    });
  }

  onEvent(handler: EventHandler): void {
    this.handler = handler;
  }

  takeHandler(): EventHandler | null {
    const previous = this.handler;
    this.handler = null;
    return previous;
  }

  send(request: ClientRequest): void {
    this.socket?.write(encode(request));
  }

  async sendAndWait(request: ClientRequest): Promise<void> {
    return new Promise((resolve) => {
      const previous = this.handler;

      this.handler = (event) => {
        previous?.(event);
        if (event.type === "turn_end") {
          this.handler = previous;
          resolve();
        }
      };

      this.send(request);
    });
  }

  /** Attaches this connection to the space rooted at `root`. Resolves with the daemon's refusal, or null once attached */
  async openSpace(root: string): Promise<string | null> {
    let refusal: string | null = null;
    const previous = this.takeHandler();

    this.onEvent((event) => {
      if (event.type === "error") refusal = event.message;
    });
    await this.sendAndWait({ type: "open_space", root });

    this.handler = previous;
    return refusal;
  }

  close(): void {
    this.socket?.end();
  }
}
