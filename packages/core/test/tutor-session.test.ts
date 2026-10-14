import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FakeProvider } from "../src/adapters/fake-provider";
import { StorageLocal } from "../src/adapters/storage-local";
import { seedRegistry, type ConceptId } from "../src/concepts";
import type { SessionId, UserId } from "../src/ids";
import type { CompletionEvent } from "../src/ports/llm";
import type { Workspace } from "../src/ports/workspace";
import { buildEvidence } from "../src/schemas/evidence";
import type { SessionState } from "../src/schemas/session";
import {
  newSessionState,
  TutorSession,
  type TurnEvent,
} from "../src/session/tutor-session";
import { testItem } from "./fixtures";

const NOW = new Date("2026-01-01T12:00:00.000Z");
const clock = { now: () => NOW };
const USER = "local" as UserId;
const SESSION = "s1" as SessionId;

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
    { type: "tool_call", call: { id: `tc_${name}`, name, arguments: args } },
    { type: "done", stopReason: "tool_use" },
  ];
}

const finish: CompletionEvent[] = [
  { type: "text_delta", text: "ok" },
  { type: "done", stopReason: "end_turn" },
];

interface Harness {
  tutor: TutorSession;
  storage: StorageLocal;
  provider: FakeProvider;
}

async function withTutor(
  script: CompletionEvent[][],
  fn: (harness: Harness) => Promise<void>,
  session: SessionState = newSessionState(SESSION, USER, "/tmp/repo", NOW),
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "hibi-turn-"));
  try {
    const storage = new StorageLocal(dir);
    const provider = new FakeProvider(script);
    const tutor = new TutorSession(
      { provider, storage, workspace, clock },
      session,
    );
    await fn({ tutor, storage, provider });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function withItem(): SessionState {
  const session = newSessionState(SESSION, USER, "/tmp/repo", NOW);
  session.items.push(testItem());
  session.activeItemId = session.items[0]!.id;
  return session;
}

async function drain(iterable: AsyncIterable<TurnEvent>): Promise<TurnEvent[]> {
  const out: TurnEvent[] = [];
  for await (const item of iterable) out.push(item);
  return out;
}

function texts(events: TurnEvent[]): string {
  return events
    .map((event) => (event.type === "text" ? event.text : ""))
    .join("");
}

describe("turn", () => {
  test("serializes state into the system prompt", async () => {
    await withTutor([finish], async ({ tutor, provider }) => {
      await drain(tutor.turn("oi"));

      const system = provider.requests[0]!.system;
      expect(system).toContain("<learner>");
      expect(system).toContain("<concepts>");
      expect(system).toContain("<session>");
    });
  });

  test("commits the session a tool changed", async () => {
    const script = [
      toolCall("propose_exercise", {
        conceptTerm: "linked list",
        statement: "implemente remove",
      }),
      finish,
    ];

    await withTutor(script, async ({ tutor, storage }) => {
      await drain(tutor.turn("me da um exercicio"));

      const saved = await storage.loadSession(SESSION);
      expect(saved?.items).toHaveLength(1);
      expect(saved?.turnCount).toBe(1);
      expect(tutor.session).toEqual(saved!);
    });
  });

  test("writes the turn's evidence with the turn index", async () => {
    const script = [
      toolCall("explain_concept", { conceptTerm: "concurrency" }),
      finish,
    ];

    await withTutor(script, async ({ tutor, storage }) => {
      await drain(tutor.turn("explica concorrencia"));

      const events = await storage.queryEvidence({ userId: USER });
      expect(events.map((event) => [event.kind, event.turnIndex])).toEqual([
        ["concept_explained", 1],
      ]);
    });
  });

  test("the ladder climbs across turns without the transcript", async () => {
    const script = [
      toolCall("record_attempt", { itemId: "itm1", outcome: "fail" }),
      toolCall("give_hint", { itemId: "itm1" }),
      finish,
    ];

    await withTutor(
      script,
      async ({ tutor, storage }) => {
        await drain(tutor.turn("travei"));

        const saved = (await storage.loadSession(SESSION))!;
        expect(saved.items[0]).toMatchObject({
          attempts: 1,
          ladder: { hintsGiven: 1, attemptsAtLastHint: 1 },
        });
      },
      withItem(),
    );
  });

  test("a provider error after a tool ran leaves no trace", async () => {
    const script: CompletionEvent[][] = [
      toolCall("propose_exercise", {
        conceptTerm: "linked list",
        statement: "implemente remove",
      }),
      [{ type: "error", message: "overloaded", retryable: false }],
    ];

    await withTutor(script, async ({ tutor, storage }) => {
      const events = await drain(tutor.turn("exercicio"));

      expect(events.at(-1)).toEqual({ type: "error", message: "overloaded" });
      expect(tutor.session.items).toHaveLength(0);
      expect(await storage.loadSession(SESSION)).toBeNull();
      expect(await storage.queryEvidence({ userId: USER })).toHaveLength(0);
      expect(await storage.loadConceptRegistry(USER)).toBeNull();
    });
  });

  test("a failed turn stays out of the transcript", async () => {
    const script: CompletionEvent[][] = [
      [{ type: "error", message: "overloaded", retryable: false }],
      finish,
    ];

    await withTutor(script, async ({ tutor, provider }) => {
      await drain(tutor.turn("primeira"));
      await drain(tutor.turn("segunda"));

      expect(provider.requests[1]!.messages).toEqual([
        { role: "user", content: "segunda" },
      ]);
    });
  });

  test("retries a failure that happened before anything was shown", async () => {
    const script: CompletionEvent[][] = [
      [{ type: "error", message: "overloaded", retryable: true }],
      finish,
    ];

    await withTutor(script, async ({ tutor, provider }) => {
      const events = await drain(tutor.turn("oi"));

      expect(texts(events)).toBe("ok");
      expect(provider.requests).toHaveLength(2);
    });
  });

  test("never retries once text reached the user", async () => {
    const script: CompletionEvent[][] = [
      [
        { type: "text_delta", text: "começando" },
        { type: "error", message: "connection reset", retryable: true },
      ],
      finish,
    ];

    await withTutor(script, async ({ tutor, provider }) => {
      const events = await drain(tutor.turn("oi"));

      expect(texts(events)).toBe("começando");
      expect(events.at(-1)?.type).toBe("error");
      expect(provider.requests).toHaveLength(1);
    });
  });

  test("after the last tool round, one more call answers without tools", async () => {
    const rounds = Array.from({ length: 6 }, () => toolCall("list_files", {}));
    const script: CompletionEvent[][] = [
      ...rounds.slice(0, 5),
      [{ type: "text_delta", text: "resumo" }, ...rounds[5]!],
    ];

    await withTutor(script, async ({ tutor, provider }) => {
      const events = await drain(tutor.turn("lista tudo"));

      expect(provider.requests).toHaveLength(6);
      expect(provider.requests.at(-1)?.toolChoice).toBe("none");
      expect(events.filter((event) => event.type === "tool")).toHaveLength(5);
      expect(texts(events)).toBe("resumo");
    });
  });
});

describe("undo", () => {
  const hintTurn = () => [
    toolCall("record_attempt", { itemId: "itm1", outcome: "fail" }),
    toolCall("give_hint", { itemId: "itm1" }),
    finish,
  ];

  test("puts the ladder back where it was before the last hint", async () => {
    await withTutor(
      [...hintTurn(), ...hintTurn()],
      async ({ tutor, storage }) => {
        await drain(tutor.turn("travei"));
        const afterFirst = structuredClone(tutor.session);
        await drain(tutor.turn("travei de novo"));
        expect(tutor.session.items[0]?.ladder?.hintsGiven).toBe(2);

        const result = await tutor.undo();

        expect(result.ok).toBe(true);
        expect(tutor.session).toEqual(afterFirst);
        expect(await storage.loadSession(SESSION)).toEqual(afterFirst);
        const hints = (await storage.queryEvidence({ userId: USER })).filter(
          (event) => event.kind === "hint_given",
        );
        expect(hints).toHaveLength(1);
      },
      withItem(),
    );
  });

  test("repeating it walks further back until nothing is left", async () => {
    await withTutor(
      [...hintTurn(), ...hintTurn()],
      async ({ tutor, storage }) => {
        await drain(tutor.turn("travei"));
        await drain(tutor.turn("travei de novo"));

        await tutor.undo();
        await tutor.undo();

        expect(tutor.session.items[0]).toMatchObject({ attempts: 0 });
        expect(tutor.session.items[0]?.ladder).toBeUndefined();
        expect(await storage.queryEvidence({ userId: USER })).toHaveLength(0);
        expect(await tutor.undo()).toEqual({
          ok: false,
          message: "nothing to undo",
        });
      },
      withItem(),
    );
  });

  test("restores the goal and drops concepts the turn created", async () => {
    const script = [
      toolCall("set_goal", { kind: "language", statement: "aprender Go" }),
      toolCall("explain_concept", {
        conceptTerm: "goroutines",
        parentTerm: "concurrency",
      }),
      finish,
    ];

    await withTutor(script, async ({ tutor, storage }) => {
      await drain(tutor.turn("quero aprender Go"));
      expect((await storage.loadLearnerModel(USER))?.goal).not.toBeNull();

      await tutor.undo();

      const learner = (await storage.loadLearnerModel(USER))!;
      const registry = (await storage.loadConceptRegistry(USER))!;
      expect(learner.goal).toBeNull();
      expect(learner.seen).toEqual([]);
      expect(registry.concepts.map((c) => c.id)).not.toContain(
        "goroutines" as ConceptId,
      );
    });
  });

  test("recomputes signals from what is left", async () => {
    const session = withItem();
    session.items[0]!.attempts = 1;

    await withTutor(
      [
        toolCall("give_hint", {
          itemId: "itm1",
          userRequestedFullAnswer: true,
        }),
        finish,
      ],
      async ({ tutor, storage }) => {
        const origin = {
          userId: USER,
          sessionId: SESSION,
          turnIndex: 0,
          at: NOW.toISOString(),
        };
        await storage.appendEvidence(
          Array.from({ length: 7 }, () =>
            buildEvidence(
              {
                kind: "hint_given",
                conceptId: "worker-pool" as ConceptId,
                provenance: "system",
                helpDepth: 3,
                forced: true,
              },
              origin,
            ),
          ),
        );

        await drain(tutor.turn("me dá a resposta"));
        const keys = async () =>
          (await storage.loadLearnerModel(USER))!.inferredSignals.map(
            (signal) => signal.key,
          );
        expect(await keys()).toContain("disclosure");

        await tutor.undo();
        expect(await keys()).not.toContain("disclosure");
      },
      session,
    );
  });
});

describe("forget", () => {
  test("retracts one concept and keeps the rest of the same turn", async () => {
    const script = [
      toolCall("explain_concept", { conceptTerm: "concurrency" }),
      toolCall("explain_concept", { conceptTerm: "testing" }),
      finish,
    ];

    await withTutor(script, async ({ tutor, storage }) => {
      await drain(tutor.turn("explica os dois"));

      const result = await tutor.forget("Concurrency");

      expect(result).toEqual({
        ok: true,
        message: "forgot 1 events on concurrency",
      });
      const left = await storage.queryEvidence({ userId: USER });
      expect(left.map((event) => event.conceptId)).toEqual([
        "testing" as ConceptId,
      ]);
      expect((await storage.loadLearnerModel(USER))?.seen).toEqual([
        "testing" as ConceptId,
      ]);
    });
  });

  test("an ambiguous term lists the candidates instead of guessing", async () => {
    await withTutor([], async ({ tutor, storage }) => {
      const registry = seedRegistry(NOW);
      for (const id of ["hash-map", "hash-set"]) {
        registry.concepts.push({
          id: id as ConceptId,
          canonicalName: id,
          aliases: [],
          parentId: "data-structures" as ConceptId,
          source: "proposed",
          createdAt: NOW.toISOString(),
        });
      }
      await storage.saveConceptRegistry(USER, registry);

      const result = await tutor.forget("hash mapping");

      expect(result.ok).toBe(false);
      expect(result.message).toContain("hash-map");
    });
  });

  test("an unknown term says so", async () => {
    await withTutor([], async ({ tutor }) => {
      expect((await tutor.forget("quantum entanglement")).ok).toBe(false);
    });
  });

  test("forgetting everything also clears what undo could bring back", async () => {
    const script = [
      toolCall("explain_concept", { conceptTerm: "concurrency" }),
      finish,
    ];

    await withTutor(script, async ({ tutor, storage }) => {
      await drain(tutor.turn("explica"));

      expect(await tutor.forgetAll()).toEqual({
        ok: true,
        message: "removed 1 events permanently",
      });
      expect(await storage.queryEvidence({ userId: USER })).toHaveLength(0);
      expect((await tutor.undo()).ok).toBe(false);
    });
  });
});
