import Anthropic from "@anthropic-ai/sdk";

import type {
  CompletionEvent,
  CompletionRequest,
  LLMProvider,
  ProviderMessage,
  TokenUsage,
} from "../ports/llm";

const EPHEMERAL = { type: "ephemeral" } as const;

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  baseURL?: string;
}

export class AnthropicProvider implements LLMProvider {
  readonly id = "anthropic";
  readonly model: string;

  private readonly client: Anthropic;

  constructor(options: AnthropicProviderOptions) {
    this.model = options.model;
    this.client = new Anthropic({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
    });
  }

  /**
   * Streams text as it arrives, then reads tool calls, usage and the stop
   * reason from the accumulated message.
   *
   * Caching: an explicit breakpoint ends the stable system prompt, so every
   * turn reuses tools, rules and profile; the top-level marker moves with the
   * conversation, so each tool round reuses the rounds before it.
   */
  async *complete(request: CompletionRequest): AsyncIterable<CompletionEvent> {
    let message: Anthropic.Message;

    try {
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: request.maxTokens,
        cache_control: EPHEMERAL,
        system: systemBlocks(request),
        messages: toApiMessages(request.messages),
        tools: request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters as Anthropic.Tool.InputSchema,
        })),
        tool_choice:
          request.toolChoice === "none" ? { type: "none" } : undefined,
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield { type: "text_delta", text: event.delta.text };
        }
      }
      message = await stream.finalMessage();
    } catch (error) {
      yield classifyAnthropicError(error);
      return;
    }

    for (const block of message.content) {
      if (block.type === "tool_use") {
        yield {
          type: "tool_call",
          call: { id: block.id, name: block.name, arguments: block.input },
        };
      }
    }

    yield { type: "usage", usage: usageOf(message.usage) };
    yield {
      type: "done",
      stopReason:
        message.stop_reason === "tool_use"
          ? "tool_use"
          : message.stop_reason === "max_tokens"
            ? "max_tokens"
            : "end_turn",
      replay: message.content.flatMap(toReplayBlock),
    };
  }
}

function systemBlocks(request: CompletionRequest): Anthropic.TextBlockParam[] {
  const blocks: Anthropic.TextBlockParam[] = [
    { type: "text", text: request.system.stable, cache_control: EPHEMERAL },
  ];
  if (request.system.volatile.length > 0) {
    blocks.push({ type: "text", text: request.system.volatile });
  }
  return blocks;
}

/**
 * Tool calls and their results are content blocks inside a message here,
 * rather than separate fields and separate messages. An assistant message
 * that carries a replay is sent back exactly as the model produced it, which
 * keeps its reasoning blocks intact across the tool round
 */
function toApiMessages(messages: ProviderMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      out.push({ role: "user", content: message.content });
      continue;
    }

    if (message.role === "assistant") {
      if (Array.isArray(message.replay)) {
        out.push({
          role: "assistant",
          content: message.replay as Anthropic.ContentBlockParam[],
        });
        continue;
      }

      const blocks: Anthropic.ContentBlockParam[] = [];
      if (message.content.length > 0) {
        blocks.push({ type: "text", text: message.content });
      }
      for (const call of message.toolCalls ?? []) {
        blocks.push({
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: call.arguments as Record<string, unknown>,
        });
      }
      out.push({ role: "assistant", content: blocks });
      continue;
    }

    out.push({
      role: "user",
      content: message.results.map((result) => ({
        type: "tool_result" as const,
        tool_use_id: result.toolCallId,
        content: result.content,
        is_error: result.isError,
      })),
    });
  }

  return out;
}

/** The request form of a response block, keeping only the fields the API takes back */
function toReplayBlock(
  block: Anthropic.ContentBlock,
): Anthropic.ContentBlockParam[] {
  switch (block.type) {
    case "thinking":
      return [
        { type: "thinking", thinking: block.thinking, signature: block.signature },
      ];
    case "redacted_thinking":
      return [{ type: "redacted_thinking", data: block.data }];
    case "text":
      return block.text.length > 0 ? [{ type: "text", text: block.text }] : [];
    case "tool_use":
      return [
        { type: "tool_use", id: block.id, name: block.name, input: block.input },
      ];
    default:
      return [];
  }
}

/** `input_tokens` counts only what was neither read from nor written to the cache */
function usageOf(usage: Anthropic.Usage): TokenUsage {
  const read = usage.cache_read_input_tokens ?? 0;
  const written = usage.cache_creation_input_tokens ?? 0;
  return {
    inputTokens: usage.input_tokens + read + written,
    cachedInputTokens: read,
    cacheWriteTokens: written,
    outputTokens: usage.output_tokens,
  };
}

function classifyAnthropicError(error: unknown): CompletionEvent {
  const status = (error as { status?: number }).status;
  const message = error instanceof Error ? error.message : String(error);
  const retryable = status === 429 || (status !== undefined && status >= 500);
  return { type: "error", message, retryable };
}
