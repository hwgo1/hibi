/** What this terminal's turns have cost so far. The daemon prices each completion; this only adds them up */
export interface SessionSpend {
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  /** Null once any completion came from a model without a known price */
  usd: number | null;
}

export interface UsageReport {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  usd: number | null;
}

export function emptySpend(): SessionSpend {
  return { inputTokens: 0, cachedTokens: 0, outputTokens: 0, usd: 0 };
}

export function addUsage(spend: SessionSpend, usage: UsageReport): SessionSpend {
  return {
    inputTokens: spend.inputTokens + usage.inputTokens,
    cachedTokens: spend.cachedTokens + usage.cachedInputTokens,
    outputTokens: spend.outputTokens + usage.outputTokens,
    usd: spend.usd === null || usage.usd === null ? null : spend.usd + usage.usd,
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
