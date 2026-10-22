/** Tool contract exposed to the model. `parameters` is a JSON schema object */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export interface TokenUsage {
  /** Every prompt token, whether billed fresh, read from the cache or written to it */
  inputTokens: number;
  /** Prompt tokens read from the provider's cache */
  cachedInputTokens?: number;
  /** Prompt tokens written to the provider's cache, billed above the fresh rate */
  cacheWriteTokens?: number;
  outputTokens: number;
}

export type ProviderMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      toolCalls?: ToolCall[];
      /**
       * The provider's own record of this message, such as reasoning blocks it
       * requires back unchanged while the turn's tool calls are answered.
       * Opaque outside the adapter that produced it
       */
      replay?: unknown;
    }
  | { role: "tool"; results: ToolResult[] };

/**
 * The system prompt in two parts: what rarely changes between turns, then
 * what changes on every turn. Providers that cache by prefix end the cached
 * part after `stable`
 */
export interface SystemPrompt {
  stable: string;
  volatile: string;
}

export function joinSystem(system: SystemPrompt): string {
  return [system.stable, system.volatile]
    .filter((part) => part.length > 0)
    .join("\n\n");
}

export interface CompletionRequest {
  system: SystemPrompt;
  messages: ProviderMessage[];
  tools: ToolDefinition[];
  /** "none" keeps the tools visible but forbids calling them, forcing a text answer */
  toolChoice?: "auto" | "none";
  /** Includes the model's reasoning on models that reason before answering */
  maxTokens: number;
}

export type CompletionEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "usage"; usage: TokenUsage }
  | {
      type: "done";
      stopReason: "end_turn" | "tool_use" | "max_tokens";
      /** Passed back as the assistant message's `replay` when the turn continues */
      replay?: unknown;
    }
  | { type: "error"; message: string; retryable: boolean };

export interface LLMProvider {
  readonly id: string;
  readonly model: string;
  complete(request: CompletionRequest): AsyncIterable<CompletionEvent>;
}
