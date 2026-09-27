import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { StorageLocal } from "../src/adapters/storage-local";
import type { SessionId, UserId } from "../src/ids";
import type { EvidenceEvent } from "../src/schemas/evidence";
import { retractionNote } from "../src/schemas/evidence";

const USER = "local" as UserId;

async function withStorage<T>(
  fn: (storage: StorageLocal) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "hibi-retract-"));
  try {
    return await fn(new StorageLocal(dir));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function event(
  turnIndex: number,
  overrides: Partial<EvidenceEvent> = {},
): EvidenceEvent {
  return {
    schemaVersion: 2,
    id: `ev${turnIndex}` as EvidenceEvent["id"],
    at: `2026-01-0${turnIndex}T00:00:00.000Z`,
    userId: USER,
    sessionId: "s1" as SessionId,
    turnIndex,
    kind: "attempt_submitted",
    conceptId: "linked-list" as EvidenceEvent["conceptId"],
    provenance: "execution",
    confidence: 1,
    outcome: "pass",
    ...overrides,
  };
}

describe("StorageLocal retractions", () => {
  test("a retracted turn stops appearing in queries", async () => {
    await withStorage(async (storage) => {
      await storage.appendEvidence(event(1));
      await storage.appendEvidence(event(2));

      await storage.appendEvidence(
        event(1, {
          id: "ret" as EvidenceEvent["id"],
          kind: "turn_retracted",
          provenance: "system",
          confidence: 0,
          outcome: "n/a",
          note: retractionNote(1),
        }),
      );

      const visible = await storage.queryEvidence({ userId: USER });
      expect(visible.map((entry) => entry.turnIndex)).toEqual([2]);
    });
  });

  test("the retracted line stays on disk, so history can be recomputed", async () => {
    await withStorage(async (storage) => {
      await storage.appendEvidence(event(1));
      await storage.appendEvidence(
        event(1, {
          id: "ret" as EvidenceEvent["id"],
          kind: "turn_retracted",
          provenance: "system",
          confidence: 0,
          outcome: "n/a",
          note: retractionNote(1),
        }),
      );

      expect(await storage.countEvidence()).toBe(2);
      expect(await storage.queryEvidence({ userId: USER })).toHaveLength(0);
    });
  });

  test("clearEvidence removes the log outright", async () => {
    await withStorage(async (storage) => {
      await storage.appendEvidence(event(1));
      await storage.clearEvidence();

      expect(await storage.countEvidence()).toBe(0);
      expect(await storage.queryEvidence({ userId: USER })).toHaveLength(0);
    });
  });

  test("countEvidence is zero before anything is written", async () => {
    await withStorage(async (storage) => {
      expect(await storage.countEvidence()).toBe(0);
    });
  });
});
