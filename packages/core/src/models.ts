import { z } from "zod";

import { AnthropicProvider } from "./adapters/anthropic-provider";
import { OpenAIProvider } from "./adapters/openai-provider";
import type { LLMProvider, TokenUsage } from "./ports/llm";

export const ProviderIdSchema = z.enum(["openai", "anthropic"]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export interface Credentials {
  provider: ProviderId;
  apiKey: string;
  model: string;
}

export interface ModelChoice {
  id: string;
  label: string;
  note: string;
}

/** Offered per provider, recommended first. The first one is what a new key starts with */
export const MODEL_CHOICES: Record<ProviderId, ModelChoice[]> = {
  openai: [
    { id: "gpt-4.1", label: "gpt-4.1", note: "recommended" },
    {
      id: "gpt-4.1-mini",
      label: "gpt-4.1-mini",
      note: "cheaper, may give full answers",
    },
  ],
  anthropic: [
    {
      id: "claude-sonnet-4-6",
      label: "claude-sonnet-4-6",
      note: "recommended",
    },
    {
      id: "claude-haiku-4-5-20251001",
      label: "claude-haiku-4.5",
      note: "cheaper, may give full answers",
    },
  ],
};

export const PROVIDER_KEY_URLS: Record<ProviderId, string> = {
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
};

export function createProvider(credentials: Credentials): LLMProvider {
  const options = { apiKey: credentials.apiKey, model: credentials.model };
  return credentials.provider === "openai"
    ? new OpenAIProvider(options)
    : new AnthropicProvider(options);
}

/** Sends the smallest possible request. Resolves with the provider's refusal, or null when the key works */
export async function verifyCredentials(
  credentials: Credentials,
): Promise<string | null> {
  for await (const event of createProvider(credentials).complete({
    system: "Reply with the single word: ok",
    messages: [{ role: "user", content: "ok" }],
    tools: [],
    maxTokens: 16,
  })) {
    if (event.type === "error") return event.message;
    if (event.type === "done") return null;
  }
  return null;
}

/** USD per million tokens */
const PRICES: Record<string, { input: number; cached: number; output: number }> =
  {
    "gpt-4.1": { input: 2, cached: 0.5, output: 8 },
    "gpt-4.1-mini": { input: 0.4, cached: 0.1, output: 1.6 },
    "claude-sonnet-4-6": { input: 3, cached: 0.3, output: 15 },
    "claude-haiku-4-5-20251001": { input: 1, cached: 0.1, output: 5 },
  };

/** What one completion cost in USD, or null for a model without a known price */
export function costOf(usage: TokenUsage, model: string): number | null {
  const price = PRICES[model];
  if (price === undefined) return null;

  const cached = usage.cachedInputTokens ?? 0;
  const fresh = Math.max(usage.inputTokens - cached, 0);
  return (
    (fresh * price.input +
      cached * price.cached +
      usage.outputTokens * price.output) /
    1_000_000
  );
}
