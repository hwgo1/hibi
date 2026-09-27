import { z } from "zod";

/**
 * Wire format between clients and the daemon, exported so every client
 * compiles against the same shape rather than a hand-written copy.
 */
export const ClientRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("message"), text: z.string().min(1) }),
  z.object({ type: z.literal("state") }),
  z.object({ type: z.literal("profile") }),
  z.object({ type: z.literal("signals") }),
  z.object({
    type: z.literal("set_preference"),
    key: z.string().min(1),
    value: z.string().min(1),
  }),
  z.object({ type: z.literal("undo") }),
  z.object({
    type: z.literal("forget"),
    scope: z.enum(["concept", "all"]),
    value: z.string().min(1).optional(),
  }),
  z.object({ type: z.literal("clear") }),
  z.object({ type: z.literal("reindex") }),
  z.object({ type: z.literal("shutdown") }),
]);

export type ClientRequest = z.infer<typeof ClientRequestSchema>;

export type ServerEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | { type: "step"; step: 1 | 2 | 3 }
  | {
      type: "usage";
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      model: string;
    }
  | { type: "turn_end" }
  | { type: "state"; payload: unknown }
  | { type: "profile"; payload: unknown }
  | { type: "signals"; payload: unknown }
  | { type: "ok"; message: string }
  | { type: "error"; message: string };

export function encode(message: ServerEvent | ClientRequest): string {
  return `${JSON.stringify(message)}\n`;
}

export function decodeLines<T>(buffer: string): {
  messages: T[];
  rest: string;
} {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  const messages: T[] = [];

  for (const part of parts) {
    if (part.trim().length === 0) continue;
    messages.push(JSON.parse(part) as T);
  }
  return { messages, rest };
}
