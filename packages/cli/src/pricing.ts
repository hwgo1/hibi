import type { TokenUsage } from "@hibi/core";

/** Approximate USD per million tokens. Exists to keep a session's spend visible */
const PRICES: Record<string, { input: number; output: number }> = {
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};

export interface SessionSpend {
  inputTokens: number;
  outputTokens: number;
  usd: number | null;
}

export function emptySpend(): SessionSpend {
  return { inputTokens: 0, outputTokens: 0, usd: 0 };
}

/** Adds a turn's usage to the running total */
export function addUsage(
  spend: SessionSpend,
  usage: TokenUsage,
  model: string,
): SessionSpend {
  const price = PRICES[model];
  const usd =
    price === undefined || spend.usd === null
      ? null
      : spend.usd +
        (usage.inputTokens * price.input + usage.outputTokens * price.output) /
          1_000_000;

  return {
    inputTokens: spend.inputTokens + usage.inputTokens,
    outputTokens: spend.outputTokens + usage.outputTokens,
    usd,
  };
}

export function formatSpend(spend: SessionSpend): string {
  const tokens = `${spend.inputTokens + spend.outputTokens} tokens`;
  if (spend.usd === null) return tokens;
  return `${tokens} · $${spend.usd.toFixed(4)}`;
}
