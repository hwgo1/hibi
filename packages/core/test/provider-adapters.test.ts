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

/** Responses API events, each numbered as the API numbers them */
const openaiEvents = (events: Array<Record<string, unknown>>): Recording =>
  events
    .map(
      (event, sequence_number) =>
        `event: ${String(event["type"])}\ndata: ${JSON.stringify({ ...event, sequence_number })}\n\n`,
    )
    .join("");

const REASONING = {
  id: "rs_1",
  type: "reasoning",
  summary: [],
  encrypted_content: "enc-abc",
};

const responseShell = (
  id: string,
  status: string,
  output: unknown[],
  usage: unknown,
) => ({
  id,
  object: "response",
  created_at: 0,
  status,
  model: "gpt-6.1-sol",
  output,
  output_text: "",
  error: null,
  incomplete_details: null,
  instructions: null,
  metadata: {},
  parallel_tool_calls: true,
  temperature: 1,
  tool_choice: "auto",
  tools: [],
  top_p: 1,
  usage,
});

/** A response that reasons, says a line and asks to read a file */
const OPENAI_TOOL_ROUND = (() => {
  const message = {
    id: "msg_1",
    type: "message",
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text: "Vou olhar o arquivo.", annotations: [] }],
  };
  const call = {
    id: "fc_1",
    type: "function_call",
    call_id: "call_1",
    name: "read_file",
    arguments: '{"path":"main.go"}',
    status: "completed",
  };
  const usage = {
    input_tokens: 3012,
    input_tokens_details: { cached_tokens: 0, cache_write_tokens: 3000 },
    output_tokens: 40,
    output_tokens_details: { reasoning_tokens: 20 },
    total_tokens: 3052,
  };

  return openaiEvents([
    { type: "response.created", response: responseShell("resp_1", "in_progress", [], null) },
    { type: "response.output_item.added", output_index: 0, item: REASONING },
    { type: "response.output_item.done", output_index: 0, item: REASONING },
    {
      type: "response.output_item.added",
      output_index: 1,
      item: { ...message, status: "in_progress", content: [] },
    },
    {
      type: "response.content_part.added",
      output_index: 1,
      item_id: "msg_1",
      content_index: 0,
      part: { type: "output_text", text: "", annotations: [] },
    },
    {
      type: "response.output_text.delta",
      output_index: 1,
      item_id: "msg_1",
      content_index: 0,
      delta: "Vou olhar ",
      logprobs: [],
    },
    {
      type: "response.output_text.delta",
      output_index: 1,
      item_id: "msg_1",
      content_index: 0,
      delta: "o arquivo.",
      logprobs: [],
    },
    { type: "response.output_item.done", output_index: 1, item: message },
    {
      type: "response.output_item.added",
      output_index: 2,
      item: { ...call, arguments: "", status: "in_progress" },
    },
    {
      type: "response.function_call_arguments.delta",
      output_index: 2,
      item_id: "fc_1",
      delta: '{"path":"main.go"}',
    },
    { type: "response.output_item.done", output_index: 2, item: call },
    {
      type: "response.completed",
      response: responseShell("resp_1", "completed", [REASONING, message, call], usage),
    },
  ]);
})();

/** The answer after the tool result, with the prompt read back from the cache */
const OPENAI_ANSWER = (() => {
  const message = {
    id: "msg_2",
    type: "message",
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text: "Pronto.", annotations: [] }],
  };
  const usage = {
    input_tokens: 3080,
    input_tokens_details: { cached_tokens: 3000, cache_write_tokens: 0 },
    output_tokens: 5,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: 3085,
  };

  return openaiEvents([
    { type: "response.created", response: responseShell("resp_2", "in_progress", [], null) },
    {
      type: "response.output_item.added",
      output_index: 0,
      item: { ...message, status: "in_progress", content: [] },
    },
    {
      type: "response.content_part.added",
      output_index: 0,
      item_id: "msg_2",
      content_index: 0,
      part: { type: "output_text", text: "", annotations: [] },
    },
    {
      type: "response.output_text.delta",
      output_index: 0,
      item_id: "msg_2",
      content_index: 0,
      delta: "Pronto.",
      logprobs: [],
    },
    { type: "response.output_item.done", output_index: 0, item: message },
    {
      type: "response.completed",
      response: responseShell("resp_2", "completed", [message], usage),
    },
  ]);
})();

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
  test("reads tool calls, usage and reasoning from a recorded Responses stream", async () => {
    const server = replay([OPENAI_TOOL_ROUND]);
    cleanup.push(server.stop);

    const events = await collect(
      new OpenAIProvider({ apiKey: "test", model: "gpt-6.1-sol", baseURL: server.url }),
    );

    expect(events.filter((e) => e.type === "text_delta")).toEqual([
      { type: "text_delta", text: "Vou olhar " },
      { type: "text_delta", text: "o arquivo." },
    ]);
    expect(events).toContainEqual({
      type: "tool_call",
      call: { id: "call_1", name: "read_file", arguments: { path: "main.go" } },
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
    expect(events.at(-1)).toMatchObject({ type: "done", stopReason: "tool_use" });
  });

  test("sends instructions, stores nothing and leaves out an empty tool list", async () => {
    const server = replay([OPENAI_ANSWER]);
    cleanup.push(server.stop);

    await collect(
      new OpenAIProvider({ apiKey: "test", model: "gpt-6.1-sol", baseURL: server.url }),
    );

    const body = server.bodies[0]!;
    expect(body["instructions"]).toBe("rules\n\n<session>");
    expect(body["store"]).toBe(false);
    expect(body["tools"]).toBeUndefined();
    expect(body["input"]).toEqual([{ role: "user", content: "oi" }]);
  });

  test("a tutor turn sends the reasoning item back with the call and its output", async () => {
    const server = replay([OPENAI_TOOL_ROUND, OPENAI_ANSWER]);
    const home = await mkdtemp(join(tmpdir(), "hibi-adapter-"));
    cleanup.push(server.stop, () => rm(home, { recursive: true, force: true }));

    const tutor = new TutorSession(
      {
        provider: new OpenAIProvider({
          apiKey: "test",
          model: "gpt-6.1-sol",
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
    const input = server.bodies[1]!["input"] as Array<Record<string, unknown>>;
    expect(input.slice(-4).map((item) => item["type"] ?? item["role"])).toEqual([
      "reasoning",
      "message",
      "function_call",
      "function_call_output",
    ]);
    expect(input.at(-4)).toMatchObject({ id: "rs_1", encrypted_content: "enc-abc" });
    expect(input.at(-1)).toMatchObject({
      type: "function_call_output",
      call_id: "call_1",
    });
  });
});
