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
  inputTokens: number;
  cachedInputTokens?: number;
  outputTokens: number;
}

export type ProviderMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; results: ToolResult[] };

export interface CompletionRequest {
  system: string;
  messages: ProviderMessage[];
  tools: ToolDefinition[];
  maxTokens: number;
}

export type CompletionEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "usage"; usage: TokenUsage }
  | { type: "done"; stopReason: "end_turn" | "tool_use" | "max_tokens" }
  | { type: "error"; message: string; retryable: boolean };

export interface ProviderCapabilities {
  supportsTools: boolean;
  /**
   * Whether the model reliably respects instruction-level constraints such as hint depth.
   * Models bellow this bar degrade the tutor and are warned about.
   */
  meetsTutorBaseline: boolean;
}

export interface LLMProvider {
  readonly id: string;
  readonly model: string;
  readonly capabilities: ProviderCapabilities;
  complete(request: CompletionRequest): AsyncIterable<CompletionEvent>;
}
