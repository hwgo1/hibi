#!/usr/bin/env bun
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

import { Daemon, findRepoRoot, socketPath } from "@hibi/daemon";
import { StorageLocal, type UserId } from "@hibi/core";

import { DaemonClient } from "./client";
import { HIBI_HOME, loadCredentials } from "./config";
import { buildProvider } from "./models";
import { runOnboarding } from "./onboarding";
import { banner, ui } from "./render";

const LOCAL_USER = "local" as UserId;
const AUTOSTART_TIMEOUT_MS = 8000;
const AUTOSTART_POLL_MS = 100;

const PREFERENCE_KEYS = [
  "language",
  "theoryDepth",
  "exerciseSize",
  "unsolicitedHints",
  "explanationStyle",
] as const;

async function runDaemon(repoRoot: string): Promise<void> {
  const credentials = await loadCredentials();
  if (credentials === null) {
    process.stderr.write("no credentials; run `hibi` first\n");
    process.exit(1);
  }

  const provider = buildProvider(credentials);
  const daemon = new Daemon({ repoRoot, provider });
  await daemon.start();

  process.stdout.write(banner(provider.model, repoRoot));
  process.stdout.write(
    ui.dim(`listening on ${socketPath(repoRoot, HIBI_HOME)}\n`),
  );

  await new Promise(() => {});
}

/** Spawns a detached daemon and waits for its socket to appear */
async function ensureDaemon(repoRoot: string): Promise<DaemonClient> {
  const path = socketPath(repoRoot, HIBI_HOME);

  try {
    const client = new DaemonClient();
    await client.connect(path);
    return client;
  } catch {
    process.stdout.write(ui.dim("starting daemon…\n"));
  }

  Bun.spawn(["bun", import.meta.path, "daemon"], {
    cwd: repoRoot,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "inherit",
  }).unref();

  const deadline = Date.now() + AUTOSTART_TIMEOUT_MS;
  for (;;) {
    await new Promise((r) => setTimeout(r, AUTOSTART_POLL_MS));
    try {
      const client = new DaemonClient();
      await client.connect(path);
      return client;
    } catch {
      if (Date.now() > deadline)
        throw new Error("daemon did not start in time");
    }
  }
}

function opening(repoRoot: string, indexed: boolean): string {
  const lines = [
    ui.dim(`repo: ${repoRoot}`),
    indexed
      ? ""
      : ui.dim(
          "not indexed yet — I can still read your files, just slower to orient",
        ),
    "",
    "Want an exercise, or would you rather I look at something you already wrote?",
    "",
  ];
  return lines.filter((line) => line.length > 0).join("\n");
}

async function chat(repoRoot: string): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });

  let credentials = await loadCredentials();
  if (credentials === null) {
    credentials = await runOnboarding(rl, HIBI_HOME);
  }

  const provider = buildProvider(credentials);
  if (!provider.capabilities.meetsTutorBaseline) {
    process.stdout.write(
      ui.dim(
        `note: ${provider.model} may ignore hint-depth limits and give full answers\n`,
      ),
    );
  }

  const client = await ensureDaemon(repoRoot);
  const indexed =
    (await new StorageLocal(HIBI_HOME).loadRepoModel(repoRoot)) !== null;

  client.onEvent((event) => {
    if (event.type === "text") stdout.write(event.text);
    else if (event.type === "tool")
      stdout.write(ui.dim(`\n  · ${event.name}\n`));
    else if (event.type === "step") stdout.write(`\n${ui.step(event.step)}\n`);
    else if (event.type === "ok") stdout.write(ui.dim(`${event.message}\n`));
    else if (event.type === "error")
      process.stderr.write(`\n${event.message}\n`);
    else if (event.type === "state" || event.type === "profile") {
      stdout.write(`${JSON.stringify(event.payload, null, 2)}\n`);
    }
  });

  stdout.write(`\n${banner(provider.model, repoRoot)}`);
  stdout.write(`${opening(repoRoot, indexed)}\n`);

  for (;;) {
    const text = (await rl.question(ui.prompt())).trim();
    if (text.length === 0) continue;
    if (text === "/exit") break;

    if (text === "/help") {
      stdout.write(
        ui.dim("/state  /profile  /prefs [key value]  /stop  /exit\n"),
      );
      continue;
    }
    if (text === "/state") {
      await client.sendAndWait({ type: "state" });
      continue;
    }
    if (text === "/profile") {
      await client.sendAndWait({ type: "profile" });
      continue;
    }
    if (text.startsWith("/prefs")) {
      await handlePrefs(text, client);
      continue;
    }
    if (text === "/stop") {
      await client.sendAndWait({ type: "shutdown" });
      break;
    }

    stdout.write("\n");
    await client.sendAndWait({ type: "message", text });
    stdout.write("\n\n");
  }

  rl.close();
  client.close();
}

async function handlePrefs(input: string, client: DaemonClient): Promise<void> {
  const [, key, value] = input.split(/\s+/);

  if (key === undefined || value === undefined) {
    const learner = await new StorageLocal(HIBI_HOME).loadLearnerModel(
      LOCAL_USER,
    );
    if (learner === null) {
      stdout.write(ui.dim("no profile yet\n"));
      return;
    }
    for (const name of PREFERENCE_KEYS) {
      stdout.write(`  ${name} = ${learner.preferences[name]}\n`);
    }
    stdout.write(ui.dim("  change with: /prefs <key> <value>\n"));
    return;
  }

  await client.sendAndWait({ type: "set_preference", key, value });
}

const [command] = process.argv.slice(2);
const repoRoot = await findRepoRoot(process.cwd());

if (command === "daemon") await runDaemon(repoRoot);
else if (command === "chat" || command === undefined) await chat(repoRoot);
else {
  process.stderr.write("usage: hibi | hibi chat | hibi daemon\n");
  process.exit(1);
}
