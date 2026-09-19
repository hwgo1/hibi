import { connect, type Socket } from "node:net";

import {
  decodeLines,
  encode,
  type ClientRequest,
  type ServerEvent,
} from "@hibi/daemon";

export class DaemonClient {
  private socket: Socket | null = null;
  private buffer = "";
  private handler: ((event: ServerEvent) => void) | null = null;

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

  onEvent(handler: (event: ServerEvent) => void): void {
    this.handler = handler;
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

  close(): void {
    this.socket?.end();
  }
}
