import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AnthropicProvider } from "../src/adapters/anthropic-provider";
import { OpenAIProvider } from "../src/adapters/openai-provider";
import { StorageLocal } from "../src/adapters/storage-local";
import type { SessionId, UserId } from "../src/ids";
import type { CompletionEvent, LLMProvider } from "../src/ports/llm";
import type { Workspace } from "../src/ports/workspace";
import { newSessionState, TutorSession } from "../src/session/tutor-session";

/** A recorded response: server-sent events in the provider's own wire format */
type Recording = string;

interface Replay {
  url: string;
  /** Request bodies in the order they arrived */
  bodies: Array<Record<string, unknown>>;
  stop(): void;
}

/** Serves the recordings in order, one per request, and keeps what each request sent */
function replay(recordings: Recording[]): Replay {
  const bodies: Array<Record<string, unknown>> = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      bodies.push((await request.json()) as Record<string, unknown>);
      const body = recordings[bodies.length - 1] ?? "";
      return new Response(body, {
        headers: { "content-type": "text/event-stream" },
      });
    },
  });
  return {
    url: server.url.href.replace(/\/$/, ""),
    bodies,
    stop: () => server.stop(true),
  };
}

const anthropicEvents = (events: Array<[string, unknown]>): Recording =>
  events
    .map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`)
    .join("");

const openaiChunks = (chunks: unknown[]): Recording =>
  `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`;

const MESSAGE_SHELL = {
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-sonnet-5-5",
  content: [],
  stop_reason: null,
  stop_sequence: null,
};

/** A turn that thinks, says a line and asks to read a file, with the stable prompt written to the cache */
const ANTHROPIC_TOOL_ROUND = anthropicEvents([
  [
    "message_start",
    {
      type: "message_start",
      message: {
        ...MESSAGE_SHELL,
        usage: {
          input_tokens: 12,
          cache_creation_input_tokens: 3000,
          cache_read_input_tokens: 0,
          output_tokens: 1,
        },
      },
    },
  ],
  [
    "content_block_start",
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "thinking", thinking: "", signature: "" },
    },
  ],
  [
    "content_block_delta",
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "" },
    },
  ],
  [
    "content_block_delta",
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "signature_delta", signature: "sig-abc" },
    },
  ],
  ["content_block_stop", { type: "content_block_stop", index: 0 }],
  [
    "content_block_start",
    {
      type: "content_block_start",
      index: 1,
      content_block: { type: "text", text: "" },
    },
  ],
  [
    "content_block_delta",
    {
      type: "content_block_delta",
      index: 1,
      delta: { type: "text_delta", text: "Vou olhar " },
    },
  ],
  [
    "content_block_delta",
    {
      type: "content_block_delta",
      index: 1,
      delta: { type: "text_delta", text: "o arquivo." },
    },
  ],
  ["content_block_stop", { type: "content_block_stop", index: 1 }],
  [
    "content_block_start",
    {
      type: "content_block_start",
      index: 2,
      content_block: { type: "tool_use", id: "toolu_1", name: "read_file", input: {} },
    },
  ],
  [
    "content_block_delta",
    {
      type: "content_block_delta",
      index: 2,
      delta: { type: "input_json_delta", partial_json: '{"path":' },
    },
  ],
  [
    "content_block_delta",
    {
      type: "content_block_delta",
      index: 2,
      delta: { type: "input_json_delta", partial_json: '"main.go"}' },
    },
  ],
  ["content_block_stop", { type: "content_block_stop", index: 2 }],
  [
    "message_delta",
    {
      type: "message_delta",
      delta: { stop_reason: "tool_use", stop_sequence: null },
      usage: { output_tokens: 40 },
    },
  ],
  ["message_stop", { type: "message_stop" }],
]);

/** The answer after the tool result, with the stable prompt read back from the cache */
const ANTHROPIC_ANSWER = anthropicEvents([
  [
    "message_start",
    {
      type: "message_start",
      message: {
        ...MESSAGE_SHELL,
        id: "msg_2",
        usage: {
          input_tokens: 80,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 3000,
          output_tokens: 1,
        },
      },
    },
  ],
  [
    "content_block_start",
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    },
  ],
  [
    "content_block_delta",
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "Pronto." },
    },
  ],
  ["content_block_stop", { type: "content_block_stop", index: 0 }],
  [
    "message_delta",
    {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: 5 },
    },
  ],
  ["message_stop", { type: "message_stop" }],
]);

const workspace: Workspace = {
  root: "/tmp/repo",
  async listFiles() {
    return { entries: [], truncated: false };
  },
  async readFile(path) {
    return { path, text: "package main\n", contentHash: "h", dirty: false };
  },
  async activeDocument() {
    return null;
  },
};

const NOW = new Date("2026-01-01T12:00:00.000Z");
const cleanup: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
});

async function collect(provider: LLMProvider): Promise<CompletionEvent[]> {
  const events: CompletionEvent[] = [];
  for await (const event of provider.complete({
    system: { stable: "rules", volatile: "<session>" },
    messages: [{ role: "user", content: "oi" }],
    tools: [],
    maxTokens: 100,
  })) {
    events.push(event);
  }
  return events;
}

describe("AnthropicProvider", () => {
  test("reads tool calls, usage and reasoning from a recorded stream", async () => {
    const server = replay([ANTHROPIC_TOOL_ROUND]);
    cleanup.push(server.stop);
    const provider = new AnthropicProvider({
      apiKey: "test",
      model: "claude-sonnet-5-5",
      baseURL: server.url,
    });

    const events = await collect(provider);

    expect(events.filter((e) => e.type === "text_delta")).toEqual([
      { type: "text_delta", text: "Vou olhar " },
      { type: "text_delta", text: "o arquivo." },
    ]);
    expect(events).toContainEqual({
      type: "tool_call",
      call: { id: "toolu_1", name: "read_file", arguments: { path: "main.go" } },
    });
    expect(events).toContainEqual({
      type: "usage",
      usage: {
        inputTokens: 3012,
        cachedInputTokens: 0,
        cacheWriteTokens: 3000,
        outputTokens: 40,
      },
    });
    const done = events.at(-1);
    expect(done).toMatchObject({ type: "done", stopReason: "tool_use" });
    expect(done?.type === "done" && done.replay).toContainEqual({
      type: "thinking",
      thinking: "",
      signature: "sig-abc",
    });
  });

  test("marks the end of the stable prompt and the moving conversation for caching", async () => {
    const server = replay([ANTHROPIC_ANSWER]);
    cleanup.push(server.stop);

    await collect(
      new AnthropicProvider({ apiKey: "test", model: "m", baseURL: server.url }),
    );

    const body = server.bodies[0]!;
    expect(body["cache_control"]).toEqual({ type: "ephemeral" });
    expect(body["system"]).toEqual([
      { type: "text", text: "rules", cache_control: { type: "ephemeral" } },
      { type: "text", text: "<session>" },
    ]);
  });

  test("a tutor turn sends the reasoning back unchanged with the tool result", async () => {
    const server = replay([ANTHROPIC_TOOL_ROUND, ANTHROPIC_ANSWER]);
    const home = await mkdtemp(join(tmpdir(), "hibi-adapter-"));
    cleanup.push(server.stop, () => rm(home, { recursive: true, force: true }));

    const tutor = new TutorSession(
      {
        provider: new AnthropicProvider({
          apiKey: "test",
          model: "claude-sonnet-5-5",
          baseURL: server.url,
        }),
        storage: new StorageLocal(home),
        workspace,
        clock: { now: () => NOW },
      },
      newSessionState("s1" as SessionId, "local" as UserId, "/tmp/repo", NOW),
    );

    const texts: string[] = [];
    for await (const event of tutor.turn("o que tem no main.go?")) {
      if (event.type === "text") texts.push(event.text);
      if (event.type === "error") throw new Error(event.message);
    }

    expect(texts.join("")).toBe("Vou olhar o arquivo.Pronto.");
    const messages = server.bodies[1]!["messages"] as Array<{
      role: string;
      content: unknown;
    }>;
    expect(messages.at(-2)).toEqual({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "", signature: "sig-abc" },
        { type: "text", text: "Vou olhar o arquivo." },
        {
          type: "tool_use",
          id: "toolu_1",
          name: "read_file",
          input: { path: "main.go" },
        },
      ],
    });
    expect(messages.at(-1)).toMatchObject({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu_1" }],
    });
  });
});

describe("OpenAIProvider", () => {
  test("counts cached tokens inside the prompt and sends one system message", async () => {
    const server = replay([
      openaiChunks([
        {
          id: "c1",
          object: "chat.completion.chunk",
          created: 0,
          model: "gpt-4.1",
          choices: [{ index: 0, delta: { role: "assistant", content: "oi" }, finish_reason: null }],
        },
        {
          id: "c1",
          object: "chat.completion.chunk",
          created: 0,
          model: "gpt-4.1",
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        },
        {
          id: "c1",
          object: "chat.completion.chunk",
          created: 0,
          model: "gpt-4.1",
          choices: [],
          usage: {
            prompt_tokens: 2000,
            completion_tokens: 10,
            total_tokens: 2010,
            prompt_tokens_details: { cached_tokens: 1500 },
          },
        },
      ]),
    ]);
    cleanup.push(server.stop);

    const events = await collect(
      new OpenAIProvider({ apiKey: "test", model: "gpt-4.1", baseURL: server.url }),
    );

    expect(events).toContainEqual({
      type: "usage",
      usage: { inputTokens: 2000, cachedInputTokens: 1500, outputTokens: 10 },
    });
    const messages = server.bodies[0]!["messages"] as unknown[];
    expect(messages[0]).toEqual({ role: "system", content: "rules\n\n<session>" });
  });
});
