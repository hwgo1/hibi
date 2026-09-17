import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { StorageLocal } from "../src/adapters/storage-local";
import { FakeProvider } from "../src/adapters/fake-provider";
import type { CompletionEvent } from "../src/ports/llm";
import type { SessionId, UserId } from "../src/ids";
import { newSessionState, TutorSession } from "../src/session/tutor-session";
import type { Workspace } from "../src/ports/workspace";

const NOW = new Date("2026-01-01T12:00:00.000Z");
const clock = { now: () => NOW };
const USER = "local" as UserId;

const workspace: Workspace = {
  root: "/tmp/repo",
  async listFiles() {
    return { entries: [{ path: "list.go", bytes: 120 }], truncated: false };
  },
  async readFile(path) {
    return { path, text: "package list\n", contentHash: "abc", dirty: false };
  },
  async activeDocument() {
    return null;
  },
};

function toolCall(name: string, args: unknown): CompletionEvent[] {
  return [
    { type: "tool_call", call: { id: "tc_1", name, arguments: args } },
    { type: "done", stopReason: "tool_use" },
  ];
}

const finish: CompletionEvent[] = [
  { type: "text_delta", text: "ok" },
  { type: "done", stopReason: "end_turn" },
];

async function withSession<T>(
  script: CompletionEvent[][],
  fn: (
    session: TutorSession,
    storage: StorageLocal,
    provider: FakeProvider,
  ) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "hibi-turn-"));
  try {
    const storage = new StorageLocal(dir);
    const provider = new FakeProvider(script);
    return await fn(
      new TutorSession({ provider, storage, workspace, clock }),
      storage,
      provider,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function drain(iterable: AsyncIterable<unknown>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const item of iterable) out.push(item);
  return out;
}

describe("TutorSession", () => {
  test("serializes state into the system prompt", async () => {
    await withSession([finish], async (tutor, _storage, provider) => {
      const state = newSessionState("s1" as SessionId, USER, "/tmp/repo", NOW);
      await drain(tutor.turn(state, [], "oi"));

      const system = provider.requests[0]!.system;
      expect(system).toContain("<learner>");
      expect(system).toContain("<concepts>");
      expect(system).toContain("<session>");
      expect(system).toContain("concurrency");
    });
  });

  test("executes a tool call and persists the resulting intent", async () => {
    const script = [
      toolCall("propose_exercise", {
        conceptTerm: "linked list",
        statement: "implemente remove",
      }),
      finish,
    ];

    await withSession(script, async (tutor, storage) => {
      const state = newSessionState("s1" as SessionId, USER, "/tmp/repo", NOW);
      await drain(tutor.turn(state, [], "me da um exercicio"));

      const saved = await storage.loadSession("s1" as SessionId);
      expect(saved?.intents).toHaveLength(1);
      expect(saved?.intents[0]!.kind).toBe("exercise");
      expect(saved?.turnCount).toBe(1);
    });
  });

  test("writes evidence for the turn", async () => {
    const script = [
      toolCall("explain_concept", { conceptTerm: "concurrency" }),
      finish,
    ];

    await withSession(script, async (tutor, storage) => {
      const state = newSessionState("s1" as SessionId, USER, "/tmp/repo", NOW);
      await drain(tutor.turn(state, [], "explica concorrencia"));

      const events = await storage.queryEvidence({ userId: USER });
      expect(events).toHaveLength(1);
      expect(events[0]!.kind).toBe("concept_explained");
      expect(events[0]!.turnIndex).toBe(1);
    });
  });

  test("the ladder climbs across turns without the transcript", async () => {
    const script = [
      toolCall("propose_exercise", {
        conceptTerm: "linked list",
        statement: "implemente remove",
      }),
      finish,
      toolCall("give_hint", { targetIntentId: "PLACEHOLDER" }),
      finish,
    ];

    await withSession(script, async (tutor, storage) => {
      const state = newSessionState("s1" as SessionId, USER, "/tmp/repo", NOW);
      await drain(tutor.turn(state, [], "exercicio"));

      const afterFirst = (await storage.loadSession("s1" as SessionId))!;
      const exerciseId = afterFirst.intents[0]!.id;
      script[2] = toolCall("give_hint", { targetIntentId: exerciseId });

      await drain(tutor.turn(afterFirst, [], "travei"));

      const afterSecond = (await storage.loadSession("s1" as SessionId))!;
      const resolveIntent = afterSecond.intents.find(
        (i) => i.kind === "resolve",
      );
      expect(resolveIntent).toBeDefined();
      expect(afterSecond.turnCount).toBe(2);
    });
  });

  test("a provider error ends the turn without persisting a partial session", async () => {
    const script: CompletionEvent[][] = [
      [{ type: "error", message: "invalid api key", retryable: false }],
    ];

    await withSession(script, async (tutor, storage) => {
      const state = newSessionState("s1" as SessionId, USER, "/tmp/repo", NOW);
      const events = await drain(tutor.turn(state, [], "oi"));

      expect(events.some((e) => (e as { type: string }).type === "error")).toBe(
        true,
      );
      expect(await storage.loadSession("s1" as SessionId)).toBeNull();
    });
  });
});
