import Anthropic from "@anthropic-ai/sdk";

import type {
  CompletionEvent,
  CompletionRequest,
  LLMProvider,
  ProviderCapabilities,
  ProviderMessage,
  TokenUsage,
} from "../ports/llm";

const TUTOR_BASELINE_PREFIXES = ["claude-opus", "claude-sonnet"];

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  baseURL?: string;
}

export class AnthropicProvider implements LLMProvider {
  readonly id = "anthropic";
  readonly model: string;
  readonly capabilities: ProviderCapabilities;

  private readonly client: Anthropic;

  constructor(options: AnthropicProviderOptions) {
    this.model = options.model;
    this.client = new Anthropic({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
    });
    this.capabilities = {
      supportsTools: true,
      meetsTutorBaseline: TUTOR_BASELINE_PREFIXES.some((prefix) =>
        options.model.startsWith(prefix),
      ),
    };
  }

  /**
   * Tool calls and their results are content blocks inside a message here,
   * rather than separate fields and separate messages.
   */
  private toApiMessages(messages: ProviderMessage[]): Anthropic.MessageParam[] {
    const out: Anthropic.MessageParam[] = [];

    for (const message of messages) {
      if (message.role === "user") {
        out.push({ role: "user", content: message.content });
        continue;
      }

      if (message.role === "assistant") {
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

  async *complete(request: CompletionRequest): AsyncIterable<CompletionEvent> {
    const pending = new Map<
      number,
      { id: string; name: string; json: string }
    >();
    let stopReason: string | null = null;
    let usage: TokenUsage | null = null;

    try {
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: this.toApiMessages(request.messages),
        tools: request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters as Anthropic.Tool.InputSchema,
        })),
      });

      for await (const event of stream) {
        if (event.type === "message_start") {
          usage = {
            inputTokens: event.message.usage.input_tokens,
            outputTokens: 0,
          };
          continue;
        }

        if (
          event.type === "content_block_start" &&
          event.content_block.type === "tool_use"
        ) {
          pending.set(event.index, {
            id: event.content_block.id,
            name: event.content_block.name,
            json: "",
          });
          continue;
        }

        if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            yield { type: "text_delta", text: event.delta.text };
            continue;
          }
          if (event.delta.type === "input_json_delta") {
            const slot = pending.get(event.index);
            if (slot !== undefined) slot.json += event.delta.partial_json;
          }
          continue;
        }

        if (event.type === "message_delta") {
          if (usage !== null) {
            usage = { ...usage, outputTokens: event.usage.output_tokens };
          }
          if (event.delta.stop_reason !== null) {
            stopReason = event.delta.stop_reason;
          }
        }
      }
    } catch (error) {
      yield classifyAnthropicError(error);
      return;
    }

    for (const slot of pending.values()) {
      let parsed: unknown;
      try {
        parsed = slot.json.length > 0 ? JSON.parse(slot.json) : {};
      } catch {
        yield {
          type: "error",
          message: `malformed tool arguments for ${slot.name}`,
          retryable: true,
        };
        return;
      }
      yield {
        type: "tool_call",
        call: { id: slot.id, name: slot.name, arguments: parsed },
      };
    }

    if (usage !== null) {
      yield { type: "usage", usage };
    }

    yield {
      type: "done",
      stopReason:
        stopReason === "tool_use"
          ? "tool_use"
          : stopReason === "max_tokens"
            ? "max_tokens"
            : "end_turn",
    };
  }
}

function classifyAnthropicError(error: unknown): CompletionEvent {
  const status = (error as { status?: number }).status;
  const message = error instanceof Error ? error.message : String(error);
  const retryable = status === 429 || (status !== undefined && status >= 500);
  return { type: "error", message, retryable };
}
