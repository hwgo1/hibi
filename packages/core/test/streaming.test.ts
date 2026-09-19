import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FakeProvider } from "../src/adapters/fake-provider";
import { StorageLocal } from "../src/adapters/storage-local";
import type { SessionId, UserId } from "../src/ids";
import type { CompletionEvent } from "../src/ports/llm";
import type { Workspace } from "../src/ports/workspace";
import { newSessionState, TutorSession } from "../src/session/tutor-session";

const NOW = new Date("2026-01-01T12:00:00.000Z");

const workspace: Workspace = {
  root: "/tmp/repo",
  async listFiles() {
    return { entries: [], truncated: false };
  },
  async readFile(path) {
    return { path, text: "", contentHash: "x", dirty: false };
  },
  async activeDocument() {
    return null;
  },
};

describe("streaming", () => {
  test("emits each text delta separately", async () => {
    const script: CompletionEvent[][] = [
      [
        { type: "text_delta", text: "um " },
        { type: "text_delta", text: "dois " },
        { type: "text_delta", text: "três" },
        { type: "usage", usage: { inputTokens: 10, outputTokens: 3 } },
        { type: "done", stopReason: "end_turn" },
      ],
    ];

    const dir = await mkdtemp(join(tmpdir(), "hibi-stream-"));
    try {
      const tutor = new TutorSession({
        provider: new FakeProvider(script),
        storage: new StorageLocal(dir),
        workspace,
        clock: { now: () => NOW },
      });

      const state = newSessionState(
        "s1" as SessionId,
        "local" as UserId,
        "/tmp/repo",
        NOW,
      );
      const texts: string[] = [];
      let usage = { inputTokens: 0, outputTokens: 0 };

      for await (const event of tutor.turn(state, [], "oi")) {
        if (event.type === "text") texts.push(event.text);
        if (event.type === "usage") usage = event.usage;
      }

      expect(texts).toEqual(["um ", "dois ", "três"]);
      expect(usage.inputTokens).toBe(10);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
