import OpenAI from "openai";

import type {
  CompletionEvent,
  CompletionRequest,
  LLMProvider,
  ProviderCapabilities,
  ProviderMessage,
} from "../ports/llm";

/**
 * Models that reliably respect instruction-level constraints such as hint
 * depth. Smaller variants tend to answer with the full solution regardless of
 * the depth instruction, which defeats the tutor, so they are flagged.
 */
const TUTOR_BASELINE_MODELS = new Set(["gpt-4.1", "gpt-4o", "o3", "o4-mini"]);

export interface OpenAIProviderOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export class OpenAIProvider implements LLMProvider {
  readonly id = "openai";
  readonly model: string;
  readonly capabilities: ProviderCapabilities;

  private readonly client: OpenAI;

  constructor(options: OpenAIProviderOptions) {
    this.model = options.model;
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
    });
    this.capabilities = {
      supportsTools: true,
      meetsTutorBaseline: TUTOR_BASELINE_MODELS.has(options.model),
    };
  }

  /** Translates the core message shape into the chat-completions format */
  private toApiMessages(
    messages: ProviderMessage[],
  ): OpenAI.ChatCompletionMessageParam[] {
    const out: OpenAI.ChatCompletionMessageParam[] = [];

    for (const message of messages) {
      if (message.role === "user") {
        out.push({ role: "user", content: message.content });
        continue;
      }
      if (message.role === "assistant") {
        out.push({
          role: "assistant",
          content: message.content.length > 0 ? message.content : null,
          tool_calls: message.toolCalls?.map((call) => ({
            id: call.id,
            type: "function" as const,
            function: {
              name: call.name,
              arguments: JSON.stringify(call.arguments),
            },
          })),
        });
        continue;
      }

      for (const result of message.results) {
        out.push({
          role: "tool",
          tool_call_id: result.toolCallId,
          content: result.content,
        });
      }
    }

    return out;
  }

  async *complete(request: CompletionRequest): AsyncIterable<CompletionEvent> {
    /**
     * Tool call arguments arrive fragmented across deltas, keyed by index, so
     * they are accumulated until the stream ends. A call cannot be emitted as
     * it streams because its arguments are not valid JSON until complete.
     */
    const pending = new Map<
      number,
      { id: string; name: string; args: string }
    >();

    let stream: AsyncIterable<OpenAI.ChatCompletionChunk>;
    try {
      stream = await this.client.chat.completions.create({
        model: this.model,
        max_completion_tokens: request.maxTokens,
        stream: true,
        messages: [
          { role: "system", content: request.system },
          ...this.toApiMessages(request.messages),
        ],
        tools: request.tools.map((tool) => ({
          type: "function" as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        })),
      });
    } catch (error) {
      yield classifyOpenAIError(error);
      return;
    }

    let finish: OpenAI.ChatCompletionChunk.Choice["finish_reason"] = null;

    try {
      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (choice === undefined) continue;

        const text = choice.delta.content;
        if (typeof text === "string" && text.length > 0) {
          yield { type: "text_delta", text };
        }

        for (const call of choice.delta.tool_calls ?? []) {
          const slot = pending.get(call.index) ?? {
            id: "",
            name: "",
            args: "",
          };
          if (call.id !== undefined) slot.id = call.id;
          if (call.function?.name !== undefined) slot.name = call.function.name;
          if (call.function?.arguments !== undefined)
            slot.args += call.function.arguments;
          pending.set(call.index, slot);
        }

        if (choice.finish_reason !== null) finish = choice.finish_reason;
      }
    } catch (error) {
      yield classifyOpenAIError(error);
      return;
    }

    for (const slot of pending.values()) {
      let parsed: unknown;
      try {
        parsed = slot.args.length > 0 ? JSON.parse(slot.args) : {};
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

    yield {
      type: "done",
      stopReason:
        finish === "tool_calls"
          ? "tool_use"
          : finish === "length"
            ? "max_tokens"
            : "end_turn",
    };
  }
}

function classifyOpenAIError(error: unknown): CompletionEvent {
  const status = (error as { status: number }).status;
  const message = error instanceof Error ? error.message : String(error);
  const retryable = status === 429 || (status !== undefined && status >= 500);
  return { type: "error", message, retryable };
}
