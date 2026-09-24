import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { StorageLocal } from "../src/adapters/storage-local";
import type { SessionId, UserId } from "../src/ids";
import type { EvidenceEvent } from "../src/schemas/evidence";

const USER = "local" as UserId;

async function withTempStorage<T>(
  fn: (storage: StorageLocal, dir: string) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "hibi-test-"));
  try {
    return await fn(new StorageLocal(dir), dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function event(overrides: Partial<EvidenceEvent> = {}): EvidenceEvent {
  return {
    schemaVersion: 2,
    id: "ev1" as EvidenceEvent["id"],
    at: "2026-01-01T00:00:00.000Z",
    userId: USER,
    sessionId: "s1" as SessionId,
    turnIndex: 0,
    kind: "hint_given",
    conceptId: "linked-list" as EvidenceEvent["conceptId"],
    provenance: "system",
    confidence: 1,
    outcome: "n/a",
    ...overrides,
  };
}

describe("StorageLocal", () => {
  test("returns null for a model that was never written", async () => {
    await withTempStorage(async (storage) => {
      expect(await storage.loadLearnerModel(USER)).toBeNull();
    });
  });

  test("appends evidence and queries it back in chronological order", async () => {
    await withTempStorage(async (storage) => {
      await storage.appendEvidence(
        event({
          id: "b" as EvidenceEvent["id"],
          at: "2026-01-02T00:00:00.000Z",
        }),
      );
      await storage.appendEvidence(
        event({
          id: "a" as EvidenceEvent["id"],
          at: "2026-01-01T00:00:00.000Z",
        }),
      );

      const found = await storage.queryEvidence({ userId: USER });
      expect(found.map((e) => e.id)).toEqual([
        "a",
        "b",
      ] as EvidenceEvent["id"][]);
    });
  });

  test("filters evidence by concept", async () => {
    await withTempStorage(async (storage) => {
      await storage.appendEvidence(event());
      await storage.appendEvidence(
        event({
          id: "ev2" as EvidenceEvent["id"],
          conceptId: "goroutines" as EvidenceEvent["conceptId"],
        }),
      );

      const found = await storage.queryEvidence({
        userId: USER,
        conceptId: "goroutines" as EvidenceEvent["conceptId"],
      });
      expect(found).toHaveLength(1);
    });
  });

  test("skips a truncated line instead of failing the whole query", async () => {
    await withTempStorage(async (storage, dir) => {
      await writeFile(
        join(dir, "evidence.jsonl"),
        `${JSON.stringify(event())}\n{"broken":\n`,
      );

      const found = await storage.queryEvidence({ userId: USER });
      expect(found).toHaveLength(1);
    });
  });
});
