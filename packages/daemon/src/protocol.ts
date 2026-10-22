import { ProviderIdSchema, type ProviderId } from "@hibi/core";
import { z } from "zod";

const RequestId = z.string().min(1).max(64);

/**
 * Wire format between clients and the daemon, exported so every client
 * compiles against the same shape rather than a hand-written copy.
 *
 * Every request carries an id chosen by the client, and everything the daemon
 * sends back for it carries that id, ending with `done`. A connection first
 * sends `open_space`; message, state, undo, forget, clear and reindex then act
 * on that space. The rest act on the user, including the settings a client
 * needs for onboarding: profile, key, provider and model.
 */
export const ClientRequestSchema = z.discriminatedUnion("type", [
  z.object({
    id: RequestId,
    type: z.literal("open_space"),
    root: z.string().min(1),
  }),
  z.object({
    id: RequestId,
    type: z.literal("message"),
    text: z.string().min(1),
  }),
  z.object({ id: RequestId, type: z.literal("state") }),
  z.object({ id: RequestId, type: z.literal("profile") }),
  z.object({ id: RequestId, type: z.literal("signals") }),
  z.object({
    id: RequestId,
    type: z.literal("set_preference"),
    key: z.string().min(1),
    value: z.string().min(1),
  }),
  z.object({ id: RequestId, type: z.literal("undo") }),
  z.object({
    id: RequestId,
    type: z.literal("forget"),
    scope: z.enum(["concept", "all"]),
    value: z.string().min(1).optional(),
  }),
  z.object({ id: RequestId, type: z.literal("settings") }),
  z.object({
    id: RequestId,
    type: z.literal("set_profile"),
    language: z.string().min(1),
    name: z.string().max(40),
  }),
  /** Verified against the provider before it is saved */
  z.object({
    id: RequestId,
    type: z.literal("set_key"),
    provider: ProviderIdSchema,
    apiKey: z.string().min(1),
  }),
  z.object({
    id: RequestId,
    type: z.literal("set_model"),
    model: z.string().min(1),
  }),
  z.object({
    id: RequestId,
    type: z.literal("set_provider"),
    provider: ProviderIdSchema,
  }),
  z.object({ id: RequestId, type: z.literal("forget_key") }),
  z.object({ id: RequestId, type: z.literal("clear") }),
  z.object({ id: RequestId, type: z.literal("reindex") }),
  z.object({ id: RequestId, type: z.literal("shutdown") }),
]);

export type ClientRequest = z.infer<typeof ClientRequestSchema>;

/** A request as callers write it; the client numbers it before sending */
export type RequestBody = ClientRequest extends infer R
  ? R extends ClientRequest
    ? Omit<R, "id">
    : never
  : never;

/** What a client needs to know before it can chat: who the learner is and which model answers */
export interface Settings {
  /** Null until onboarding saves one */
  profile: { language: string; name: string } | null;
  /** Null until a key is saved or given in the environment */
  provider: ProviderId | null;
  model: string | null;
  storedProviders: ProviderId[];
  meetsTutorBaseline: boolean;
}

/** What the daemon says about one request, before it is tagged with the request's id */
export type Reply =
  | { type: "space"; id: string; root: string }
  | { type: "text"; text: string }
  | { type: "tool"; name: string; args?: unknown }
  | { type: "step"; step: 1 | 2 | 3 }
  | {
      type: "usage";
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      model: string;
      /** Null when the model's price is unknown */
      usd: number | null;
    }
  | { type: "state"; payload: unknown }
  | { type: "profile"; payload: unknown }
  | { type: "signals"; payload: unknown }
  | { type: "settings"; payload: Settings }
  | { type: "ok"; message: string }
  | { type: "error"; message: string }
  | { type: "done" };

/**
 * `requestId` names the request that caused the event. Events of a turn also
 * carry `spaceId`, since every client on the space receives them, including
 * clients that did not send the message
 */
export type ServerEvent = Reply & { requestId: string; spaceId?: string };

export function encode(message: ServerEvent | ClientRequest): string {
  return `${JSON.stringify(message)}\n`;
}

/** Splits complete lines off the buffer. A line that is not JSON decodes to null instead of throwing */
export function decodeLines(buffer: string): {
  messages: unknown[];
  rest: string;
} {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  const messages: unknown[] = [];

  for (const part of parts) {
    if (part.trim().length === 0) continue;
    try {
      messages.push(JSON.parse(part));
    } catch {
      messages.push(null);
    }
  }
  return { messages, rest };
}
