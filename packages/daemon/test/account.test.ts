import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { StorageLocal } from "@hibi/core";

import { ActiveProvider } from "../src/active-provider";
import { CredentialStore } from "../src/credentials";
import { Daemon, type Client } from "../src/daemon";
import type { RequestBody, ServerEvent, Settings } from "../src/protocol";

const ENV_KEYS = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "HIBI_MODEL"];
const savedEnv = new Map<string, string | undefined>();

let base = "";
let home = "";
let repo = "";
let counter = 0;

beforeEach(async () => {
  for (const key of ENV_KEYS) {
    savedEnv.set(key, process.env[key]);
    delete process.env[key];
  }
  base = await mkdtemp(join(tmpdir(), "hibi-account-"));
  home = join(base, "home");
  repo = join(base, "repo");
  await mkdir(repo);
});

const running: Daemon[] = [];
function track(daemon: Daemon): Daemon {
  running.push(daemon);
  return daemon;
}

afterEach(async () => {
  await Promise.all(running.splice(0).map((daemon) => daemon.close()));
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await rm(base, { recursive: true, force: true });
});

const received: ServerEvent[] = [];
/** One connection for the whole test, so a space opened stays open for later requests */
const connection: Client = { send: (event) => received.push(event) };

/** Sends one request and returns what came back for it, `done` excluded */
async function call(
  daemon: Daemon,
  body: Exclude<RequestBody, { type: "shutdown" }>,
): Promise<ServerEvent[]> {
  const id = `a${++counter}`;
  await daemon.handle({ ...body, id } as never, connection);
  return received.filter((e) => e.requestId === id && e.type !== "done");
}

async function settings(daemon: Daemon): Promise<Settings> {
  const [event] = await call(daemon, { type: "settings" });
  if (event?.type !== "settings") throw new Error("no settings");
  return event.payload;
}

describe("Account", () => {
  test("a fresh home has no profile and no provider", async () => {
    expect(await settings(track(new Daemon({ home })))).toMatchObject({
      profile: null,
      provider: null,
      model: null,
      storedProviders: [],
    });
  });

  test("a message before a key is set up says so instead of failing silently", async () => {
    const daemon = track(new Daemon({ home }));
    await call(daemon, { type: "open_space", root: repo });
    await call(daemon, { type: "set_profile", language: "pt-BR", name: "Hugo" });

    const events = await call(daemon, { type: "message", text: "oi" });

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "error",
        message: "no model is set up yet: open hibi to add an API key",
      }),
    );
  });

  test("the profile keeps a canonical language and refuses a stray word", async () => {
    const daemon = track(new Daemon({ home }));

    const refused = await call(daemon, {
      type: "set_profile",
      language: "sim",
      name: "Hugo",
    });
    expect(refused[0]).toMatchObject({ type: "error" });
    expect((await settings(daemon)).profile).toBeNull();

    await call(daemon, { type: "set_profile", language: "pt-br", name: " Hugo " });
    expect((await settings(daemon)).profile).toEqual({
      language: "pt-BR",
      name: "Hugo",
    });
  });

  test("switching model or provider without a saved key is refused", async () => {
    const daemon = track(new Daemon({ home }));

    expect((await call(daemon, { type: "set_model", model: "x" }))[0]).toMatchObject({
      type: "error",
    });
    expect(
      (await call(daemon, { type: "set_provider", provider: "anthropic" }))[0],
    ).toMatchObject({ type: "error" });
  });

  test("a saved key is active on start, and switching model and provider applies at once", async () => {
    const store = new CredentialStore(home);
    await store.save({ provider: "openai", apiKey: "sk-a", model: "gpt-4.1" });
    await store.save({
      provider: "anthropic",
      apiKey: "sk-b",
      model: "claude-sonnet-4-6",
    });
    const daemon = track(new Daemon({ home }));

    expect(await settings(daemon)).toMatchObject({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      storedProviders: ["openai", "anthropic"],
    });

    await call(daemon, { type: "set_provider", provider: "openai" });
    await call(daemon, { type: "set_model", model: "gpt-4.1-mini" });

    expect(await settings(daemon)).toMatchObject({
      provider: "openai",
      model: "gpt-4.1-mini",
    });

    await call(daemon, { type: "forget_key" });
    expect((await settings(daemon)).provider).toBeNull();
  });
});

describe("CredentialStore", () => {
  test("a file of another shape reads as no credentials", async () => {
    await mkdir(home, { recursive: true });
    await writeFile(
      join(home, "credentials.json"),
      JSON.stringify({ provider: "openai", apiKey: "sk-old", model: "gpt-4.1" }),
    );

    expect(await new CredentialStore(home).active()).toBeNull();
  });

  test("a key in the environment wins over the file", async () => {
    await new CredentialStore(home).save({
      provider: "anthropic",
      apiKey: "sk-file",
      model: "claude-sonnet-4-6",
    });
    process.env["OPENAI_API_KEY"] = "sk-env";

    expect(await new CredentialStore(home).active()).toMatchObject({
      provider: "openai",
      apiKey: "sk-env",
    });
  });

  test.skipIf(process.platform === "win32")(
    "the file is readable only by the user",
    async () => {
      await new CredentialStore(home).save({
        provider: "openai",
        apiKey: "sk-a",
        model: "gpt-4.1",
      });
      const mode = (await stat(join(home, "credentials.json"))).mode & 0o777;
      expect(mode).toBe(0o600);
    },
  );
});

describe("ActiveProvider", () => {
  test("without a key, it answers with an error that names the fix", async () => {
    const provider = new ActiveProvider(null);
    const events = [];
    for await (const event of provider.complete({
      system: { stable: "", volatile: "" },
      messages: [],
      tools: [],
      maxTokens: 1,
    })) {
      events.push(event);
    }

    expect(events[0]).toMatchObject({ type: "error", retryable: false });
  });
});

describe("storage without locks", () => {
  test("writes leave no lock files behind", async () => {
    const daemon = track(new Daemon({ home }));
    await call(daemon, { type: "set_profile", language: "en", name: "" });

    const storage = new StorageLocal(home);
    expect(await storage.loadLearnerModel("local" as never)).not.toBeNull();
    await expect(stat(join(home, "profile.json.lock"))).rejects.toThrow();
  });
});
