import type { TokenUsage } from "@hibi/core";

const PRICES: Record<
  string,
  { input: number; cached: number; output: number }
> = {
  "gpt-4.1": { input: 2, cached: 0.5, output: 8 },
  "gpt-4.1-mini": { input: 0.4, cached: 0.1, output: 1.6 },
  "claude-sonnet-4-6": { input: 3, cached: 0.3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 1, cached: 0.1, output: 5 },
};

export interface SessionSpend {
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  usd: number | null;
}

export function emptySpend(): SessionSpend {
  return { inputTokens: 0, cachedTokens: 0, outputTokens: 0, usd: 0 };
}

export function addUsage(
  spend: SessionSpend,
  usage: TokenUsage,
  model: string,
): SessionSpend {
  const price = PRICES[model];
  const cached = usage.cachedInputTokens ?? 0;
  const fresh = Math.max(usage.inputTokens - cached, 0);

  const usd =
    price === undefined || spend.usd === null
      ? null
      : spend.usd +
        (fresh * price.input +
          cached * price.cached +
          usage.outputTokens * price.output) /
          1_000_000;

  return {
    inputTokens: spend.inputTokens + usage.inputTokens,
    cachedTokens: spend.cachedTokens + cached,
    outputTokens: spend.outputTokens + usage.outputTokens,
    usd,
  };
}

export function formatSpend(spend: SessionSpend): string {
  const total = spend.inputTokens + spend.outputTokens;
  const cached = spend.cachedTokens > 0 ? ` · ${share(spend)}% cached` : "";
  const cost = spend.usd === null ? "" : ` · $${spend.usd.toFixed(4)}`;
  return `${total} tokens${cached}${cost}`;
}

function share(spend: SessionSpend): number {
  if (spend.inputTokens === 0) return 0;
  return Math.round((spend.cachedTokens / spend.inputTokens) * 100);
}
