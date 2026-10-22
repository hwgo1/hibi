import OpenAI from "openai";

import type {
  CompletionEvent,
  CompletionRequest,
  LLMProvider,
  ProviderMessage,
  TokenUsage,
  ToolCall,
} from "../ports/llm";
import { joinSystem } from "../ports/llm";

type InputItem = OpenAI.Responses.ResponseInputItem;

export interface OpenAIProviderOptions {
  apiKey: string;
  model: string;
  baseURL?: string;
}

/**
 * Talks to the Responses API, the one current OpenAI models support for tool
 * calling. Nothing is stored on OpenAI's side: every request carries the
 * whole conversation, and the output items of a tool round, reasoning
 * included, go back unchanged in the next request
 */
export class OpenAIProvider implements LLMProvider {
  readonly id = "openai";
  readonly model: string;

  private readonly client: OpenAI;

  constructor(options: OpenAIProviderOptions) {
    this.model = options.model;
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
    });
  }

  async *complete(request: CompletionRequest): AsyncIterable<CompletionEvent> {
    let response: OpenAI.Responses.Response;

    try {
      const stream = this.client.responses.stream({
        model: this.model,
        instructions: joinSystem(request.system),
        input: toInput(request.messages),
        tools:
          request.tools.length === 0
            ? undefined
            : request.tools.map((tool) => ({
                type: "function" as const,
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
                strict: false,
              })),
        tool_choice: request.toolChoice === "none" ? "none" : undefined,
        max_output_tokens: request.maxTokens,
        store: false,
      });

      for await (const event of stream) {
        if (event.type === "response.output_text.delta") {
          yield { type: "text_delta", text: event.delta };
        }
      }
      response = await stream.finalResponse();
    } catch (error) {
      yield classifyOpenAIError(error);
      return;
    }

    if (response.status === "failed") {
      yield {
        type: "error",
        message: response.error?.message ?? "the response failed",
        retryable: true,
      };
      return;
    }

    const calls: ToolCall[] = [];
    for (const item of response.output) {
      if (item.type !== "function_call") continue;
      try {
        const args: unknown =
          item.arguments.length > 0 ? JSON.parse(item.arguments) : {};
        calls.push({ id: item.call_id, name: item.name, arguments: args });
      } catch {
        yield {
          type: "error",
          message: `malformed tool arguments for ${item.name}`,
          retryable: true,
        };
        return;
      }
    }

    for (const call of calls) yield { type: "tool_call", call };
    if (response.usage !== undefined) {
      yield { type: "usage", usage: usageOf(response.usage) };
    }
    yield {
      type: "done",
      stopReason:
        calls.length > 0
          ? "tool_use"
          : response.incomplete_details?.reason === "max_output_tokens"
            ? "max_tokens"
            : "end_turn",
      replay: response.output,
    };
  }
}

/**
 * Tool calls and their results are items of their own here, matched by
 * `call_id`. An assistant message with a replay is sent back as the output
 * items the model produced
 */
function toInput(messages: ProviderMessage[]): InputItem[] {
  const input: InputItem[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      input.push({ role: "user", content: message.content });
      continue;
    }

    if (message.role === "assistant") {
      if (Array.isArray(message.replay)) {
        input.push(...(message.replay as InputItem[]));
        continue;
      }
      if (message.content.length > 0) {
        input.push({ role: "assistant", content: message.content });
      }
      for (const call of message.toolCalls ?? []) {
        input.push({
          type: "function_call",
          call_id: call.id,
          name: call.name,
          arguments: JSON.stringify(call.arguments),
        });
      }
      continue;
    }

    for (const result of message.results) {
      input.push({
        type: "function_call_output",
        call_id: result.toolCallId,
        output: result.content,
      });
    }
  }

  return input;
}

/** `input_tokens` already counts the cached part and the part written to the cache */
function usageOf(usage: OpenAI.Responses.ResponseUsage): TokenUsage {
  return {
    inputTokens: usage.input_tokens,
    cachedInputTokens: usage.input_tokens_details?.cached_tokens ?? 0,
    cacheWriteTokens: usage.input_tokens_details?.cache_write_tokens ?? 0,
    outputTokens: usage.output_tokens,
  };
}

function classifyOpenAIError(error: unknown): CompletionEvent {
  const status = (error as { status?: number }).status;
  const message = error instanceof Error ? error.message : String(error);
  const retryable = status === 429 || (status !== undefined && status >= 500);
  return { type: "error", message, retryable };
}
