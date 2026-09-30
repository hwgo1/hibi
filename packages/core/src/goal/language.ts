import { languageOf } from "../repo/ignore";
import type { EvidenceEvent } from "../schemas/evidence";
import { evidenceWeight } from "../schemas/evidence";

/** Minimum weighted evidence before a language reading means anything */
const MIN_WEIGHT = 2;

export interface LanguageStanding {
  language: string;
  level: number;
  weight: number;
}

export function languageStanding(events: EvidenceEvent[]): LanguageStanding[] {
  const totals = new Map<string, { score: number; weight: number }>();

  for (const event of events) {
    if (event.filePath === undefined) continue;
    if (event.outcome !== "pass" && event.outcome !== "fail") continue;

    const language = languageOf(event.filePath);
    if (language === null) continue;

    const weight = evidenceWeight(event);
    if (weight === 0) continue;

    const current = totals.get(language) ?? { score: 0, weight: 0 };
    current.score += (event.outcome === "pass" ? 1 : 0) * weight;
    current.weight += weight;
    totals.set(language, current);
  }

  return [...totals.entries()]
    .filter(([, total]) => total.weight >= MIN_WEIGHT)
    .map(([language, total]) => ({
      language,
      level: total.score / total.weight,
      weight: total.weight,
    }))
    .sort((a, b) => b.weight - a.weight);
}
