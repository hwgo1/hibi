#!/usr/bin/env bun
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

import {
  StorageLocal,
  type LearnerModel,
  type SessionState,
  type UserId,
} from "@hibi/core";
import { Daemon, findRepoRoot, socketPath } from "@hibi/daemon";

import { DaemonClient } from "./client";
import { HIBI_HOME, loadCredentials } from "./config";
import { formatProfile, formatState } from "./format";
import { buildProvider } from "./models";
import { runOnboarding } from "./onboarding";
import {
  addUsage,
  emptySpend,
  formatSpend,
  type SessionSpend,
} from "./pricing";
import { banner, ui } from "./render";
import { Spinner } from "./spinner";
import { Typewriter } from "./typewriter";

const LOCAL_USER = "local" as UserId;
const AUTOSTART_TIMEOUT_MS = 8000;
const AUTOSTART_POLL_MS = 100;

const PREFERENCE_KEYS = [
  "name",
  "language",
  "theoryDepth",
  "exerciseSize",
  "unsolicitedHints",
  "explanationStyle",
] as const;

const HELP =
  "/state [--json]  /profile [--json]  /prefs [key value]  /clear  /cost  /stop  /exit";

async function runDaemon(repoRoot: string): Promise<void> {
  const credentials = await loadCredentials();
  if (credentials === null) {
    process.stderr.write("no credentials; run `hibi` first\n");
    process.exit(1);
  }

  const provider = buildProvider(credentials);
  const daemon = new Daemon({ repoRoot, provider });
  await daemon.start();

  stdout.write(banner(provider.model, repoRoot));
  stdout.write(ui.dim(`listening on ${socketPath(repoRoot, HIBI_HOME)}\n`));

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
    stdout.write(ui.dim("starting daemon…\n"));
  }

  Bun.spawn(["bun", import.meta.path, "daemon"], {
    cwd: repoRoot,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "inherit",
  }).unref();

  const deadline = Date.now() + AUTOSTART_TIMEOUT_MS;

  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, AUTOSTART_POLL_MS));
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
    stdout.write(
      ui.dim(
        `note: ${provider.model} may ignore hint-depth limits and give full answers\n`,
      ),
    );
  }

  const client = await ensureDaemon(repoRoot);
  const storage = new StorageLocal(HIBI_HOME);
  const indexed = (await storage.loadRepoModel(repoRoot)) !== null;

  let spend: SessionSpend = emptySpend();
  let showRaw = false;
  let streaming = false;

  const typewriter = new Typewriter((text) => stdout.write(text));
  const spinner = new Spinner((text) => stdout.write(text));

  client.onEvent((event) => {
    if (event.type === "text") {
      if (!streaming) {
        spinner.stop();
        streaming = true;
      }
      typewriter.push(event.text);
      return;
    }

    if (event.type === "tool") {
      spinner.start(event.name);
      return;
    }

    if (event.type === "step") {
      typewriter.push(`\n${ui.step(event.step)}\n`);
      return;
    }

    if (event.type === "usage") {
      spend = addUsage(
        spend,
        { inputTokens: event.inputTokens, outputTokens: event.outputTokens },
        event.model,
      );
      return;
    }

    if (event.type === "turn_end") {
      return;
    }

    spinner.stop();
    typewriter.flush();

    if (event.type === "ok") {
      stdout.write(ui.dim(`${event.message}\n`));
    } else if (event.type === "error") {
      process.stderr.write(`\n${event.message}\n`);
    } else if (event.type === "state") {
      stdout.write(
        showRaw
          ? `${JSON.stringify(event.payload, null, 2)}\n`
          : `${formatState(event.payload as SessionState)}\n`,
      );
    } else if (event.type === "profile") {
      stdout.write(
        showRaw
          ? `${JSON.stringify(event.payload, null, 2)}\n`
          : `${formatProfile(event.payload as LearnerModel)}\n`,
      );
    }
  });

  stdout.write(`\n${banner(provider.model, repoRoot)}`);
  stdout.write(`${opening(repoRoot, indexed)}\n`);

  for (;;) {
    const text = (await rl.question(ui.prompt())).trim();
    if (text.length === 0) continue;

    if (text === "/exit") break;

    if (text === "/help") {
      stdout.write(ui.dim(`${HELP}\n`));
      continue;
    }
    if (text.startsWith("/state")) {
      showRaw = text.includes("--json");
      await client.sendAndWait({ type: "state" });
      continue;
    }
    if (text.startsWith("/profile")) {
      showRaw = text.includes("--json");
      await client.sendAndWait({ type: "profile" });
      continue;
    }
    if (text.startsWith("/prefs")) {
      await handlePrefs(text, client, storage);
      continue;
    }
    if (text === "/clear") {
      await client.sendAndWait({ type: "clear" });
      continue;
    }
    if (text === "/cost") {
      stdout.write(`${ui.dim(formatSpend(spend))}\n`);
      continue;
    }
    if (text === "/stop") {
      await client.sendAndWait({ type: "shutdown" });
      break;
    }
    if (text.startsWith("/")) {
      stdout.write(ui.dim(`unknown command. ${HELP}\n`));
      continue;
    }

    stdout.write("\n");
    streaming = false;
    spinner.start("thinking");

    await client.sendAndWait({ type: "message", text });

    spinner.stop();
    await typewriter.drain();
    stdout.write(`\n${ui.dim(formatSpend(spend))}\n\n`);
  }

  rl.close();
  client.close();
}

async function handlePrefs(
  input: string,
  client: DaemonClient,
  storage: StorageLocal,
): Promise<void> {
  const [, key, ...rest] = input.split(/\s+/);
  const value = rest.join(" ").trim();

  if (key === undefined || value.length === 0) {
    const learner = await storage.loadLearnerModel(LOCAL_USER);
    if (learner === null) {
      stdout.write(ui.dim("no profile yet\n"));
      return;
    }
    for (const name of PREFERENCE_KEYS) {
      const current = learner.preferences[name];
      stdout.write(
        `  ${name} = ${current === "" ? ui.dim("(unset)") : current}\n`,
      );
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
