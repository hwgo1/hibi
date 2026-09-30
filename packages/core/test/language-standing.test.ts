import { describe, expect, test } from "bun:test";

import { languageStanding } from "../src/goal/language";
import type { SessionId, UserId } from "../src/ids";
import type { EvidenceEvent } from "../src/schemas/evidence";

function event(overrides: Partial<EvidenceEvent> = {}): EvidenceEvent {
  return {
    schemaVersion: 2,
    id: "ev" as EvidenceEvent["id"],
    at: "2026-01-01T00:00:00.000Z",
    userId: "local" as UserId,
    sessionId: "s1" as SessionId,
    turnIndex: 1,
    kind: "test_run",
    conceptId: "concurrency" as EvidenceEvent["conceptId"],
    provenance: "execution",
    confidence: 1,
    outcome: "pass",
    filePath: "internal/pool.go",
    ...overrides,
  };
}

function repeat(
  count: number,
  overrides: Partial<EvidenceEvent>,
): EvidenceEvent[] {
  return Array.from({ length: count }, () => event(overrides));
}

describe("languageStanding", () => {
  test("reads the language from the file path", () => {
    const standing = languageStanding(repeat(3, {}));

    expect(standing[0]?.language).toBe("Go");
    expect(standing[0]?.level).toBe(1);
  });

  test("keeps languages apart", () => {
    const standing = languageStanding([
      ...repeat(3, { filePath: "pool.go" }),
      ...repeat(3, { filePath: "app.ts" }),
    ]);

    expect(standing.map((entry) => entry.language).sort()).toEqual([
      "Go",
      "TypeScript",
    ]);
  });

  test("ignores events with no file", () => {
    expect(languageStanding(repeat(5, { filePath: undefined }))).toHaveLength(
      0,
    );
  });

  test("ignores events that carry no weight", () => {
    const standing = languageStanding(
      repeat(5, { provenance: "system", outcome: "pass" }),
    );
    expect(standing).toHaveLength(0);
  });

  test("reports below full when some attempts failed", () => {
    const standing = languageStanding([
      ...repeat(2, { outcome: "pass" }),
      ...repeat(2, { outcome: "fail" }),
    ]);

    expect(standing[0]?.level).toBeCloseTo(0.5, 5);
  });

  test("stays quiet below the minimum weight", () => {
    const standing = languageStanding([event({ provenance: "self_declared" })]);
    expect(standing).toHaveLength(0);
  });
});
