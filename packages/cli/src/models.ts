import {
  AnthropicProvider,
  OpenAIProvider,
  type LLMProvider,
} from "@hibi/core";

import type { Credentials, ProviderId } from "./config";

export interface ModelChoice {
  id: string;
  label: string;
  note: string;
}

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

export function buildProvider(credentials: Credentials): LLMProvider {
  if (credentials.provider === "openai") {
    return new OpenAIProvider({
      apiKey: credentials.apiKey,
      model: credentials.model,
    });
  }
  return new AnthropicProvider({
    apiKey: credentials.apiKey,
    model: credentials.model,
  });
}

export async function verifyCredentials(
  credentials: Credentials,
): Promise<string | null> {
  const provider = buildProvider(credentials);

  for await (const event of provider.complete({
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
