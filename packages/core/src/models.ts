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
    { id: "gpt-6.1-sol", label: "gpt-6.1-sol", note: "recommended" },
    {
      id: "gpt-6-luna",
      label: "gpt-6-luna",
      note: "cheaper, may give full answers",
    },
  ],
  anthropic: [
    {
      id: "claude-sonnet-5-5",
      label: "claude-sonnet-5.5",
      note: "recommended",
    },
    {
      id: "claude-haiku-5-5",
      label: "claude-haiku-5.5",
      note: "cheaper, may give full answers",
    },
  ],
};

export const PROVIDER_KEY_URLS: Record<ProviderId, string> = {
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
};

/** Small tiers tend to hand over the whole answer whatever the hint depth asks, so they are flagged by family */
const SMALL_TIER = /haiku|mini|nano|luna/;

/** Whether the model reliably keeps to instruction-level limits such as hint depth */
export function meetsTutorBaseline(model: string): boolean {
  return !SMALL_TIER.test(model);
}

export function createProvider(credentials: Credentials): LLMProvider {
  const options = { apiKey: credentials.apiKey, model: credentials.model };
  return credentials.provider === "openai"
    ? new OpenAIProvider(options)
    : new AnthropicProvider(options);
}

/**
 * Sends the smallest useful request. Resolves with the provider's refusal, or
 * null when the key works. The token budget leaves room for a model that
 * reasons before answering even a trivial prompt
 */
export async function verifyCredentials(
  credentials: Credentials,
): Promise<string | null> {
  for await (const event of createProvider(credentials).complete({
    system: { stable: "Reply with the single word: ok", volatile: "" },
    messages: [{ role: "user", content: "ok" }],
    tools: [],
    maxTokens: 1024,
  })) {
    if (event.type === "error") return event.message;
    if (event.type === "done") return null;
  }
  return null;
}

/** USD per million tokens */
interface Rates {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
}

interface Price extends Rates {
  /** Higher rates for a request whose prompt passes `tokens` */
  longPrompt?: { tokens: number; rates: Rates };
}

/** Checked against each provider's pricing page on this date */
export const PRICES_REVIEWED = "2026-10-22";

const PRICES: Record<string, Price> = {
  "claude-sonnet-5-5": { input: 2, cacheRead: 0.1, cacheWrite: 2.5, output: 10 },
  "claude-haiku-5-5": {
    input: 0.1,
    cacheRead: 0.01,
    cacheWrite: 0.125,
    output: 0.5,
    longPrompt: {
      tokens: 100_000,
      rates: { input: 0.5, cacheRead: 0.05, cacheWrite: 0.625, output: 2.5 },
    },
  },
  "claude-sonnet-4-6": { input: 3, cacheRead: 0.3, cacheWrite: 3.75, output: 15 },
  "claude-haiku-4-5-20251001": {
    input: 1,
    cacheRead: 0.1,
    cacheWrite: 1.25,
    output: 5,
  },
  "gpt-6.1-sol": { input: 2, cacheRead: 0.1, cacheWrite: 2.5, output: 10 },
  "gpt-6-luna": { input: 0.1, cacheRead: 0.01, cacheWrite: 0.125, output: 0.5 },
  "gpt-4.1": { input: 2, cacheRead: 0.5, cacheWrite: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, cacheRead: 0.1, cacheWrite: 0.4, output: 1.6 },
};

/** What one completion cost in USD, or null for a model without a known price */
export function costOf(usage: TokenUsage, model: string): number | null {
  const price = PRICES[model];
  if (price === undefined) return null;

  const long = price.longPrompt;
  const rates =
    long !== undefined && usage.inputTokens > long.tokens ? long.rates : price;

  const read = usage.cachedInputTokens ?? 0;
  const written = usage.cacheWriteTokens ?? 0;
  const fresh = Math.max(usage.inputTokens - read - written, 0);

  return (
    (fresh * rates.input +
      read * rates.cacheRead +
      written * rates.cacheWrite +
      usage.outputTokens * rates.output) /
    1_000_000
  );
}
