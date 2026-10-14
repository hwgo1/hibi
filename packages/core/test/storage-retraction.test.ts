import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { StorageLocal } from "../src/adapters/storage-local";
import type { SessionId, UserId } from "../src/ids";
import type { EvidenceEvent } from "../src/schemas/evidence";
import { buildRetraction } from "../src/schemas/evidence";

const USER = "local" as UserId;

async function withStorage<T>(
  fn: (storage: StorageLocal, dir: string) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "hibi-retract-"));
  try {
    return await fn(new StorageLocal(dir), dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function event(turnIndex: number): EvidenceEvent {
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
  };
}

const ORIGIN = {
  userId: USER,
  sessionId: "s1" as SessionId,
  turnIndex: 3,
  at: "2026-01-03T00:00:00.000Z",
};

describe("StorageLocal retractions", () => {
  test("a retracted event stops appearing in queries", async () => {
    await withStorage(async (storage) => {
      await storage.appendEvidence([event(1), event(2)]);
      await storage.appendEvidence([buildRetraction([event(1)], ORIGIN)]);

      const visible = await storage.queryEvidence({ userId: USER });
      expect(visible.map((entry) => entry.turnIndex)).toEqual([2]);
    });
  });

  test("the retracted line stays on disk, so history can be recomputed", async () => {
    await withStorage(async (storage, dir) => {
      await storage.appendEvidence([event(1)]);
      await storage.appendEvidence([buildRetraction([event(1)], ORIGIN)]);

      const lines = (await readFile(join(dir, "evidence.jsonl"), "utf8"))
        .trim()
        .split("\n");
      expect(lines).toHaveLength(2);
      expect(await storage.queryEvidence({ userId: USER })).toHaveLength(0);
    });
  });

  test("clearEvidence removes the log and says how much it held", async () => {
    await withStorage(async (storage) => {
      await storage.appendEvidence([event(1), event(2)]);

      expect(await storage.clearEvidence()).toBe(2);
      expect(await storage.queryEvidence({ userId: USER })).toHaveLength(0);
    });
  });

  test("clearing an empty log removes nothing", async () => {
    await withStorage(async (storage) => {
      expect(await storage.clearEvidence()).toBe(0);
    });
  });
});
