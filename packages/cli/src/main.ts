#!/usr/bin/env bun
import { stdin, stdout } from "node:process";
import { createInterface, type Interface } from "node:readline/promises";

import {
  StorageLocal,
  type InferredSignal,
  type LearnerModel,
  type SessionState,
  type UserId,
} from "@hibi/core";
import { Daemon, findRepoRoot, socketPath } from "@hibi/daemon";

import { DaemonClient } from "./client";
import {
  activateProvider,
  clearCredentials,
  HIBI_HOME,
  loadCredentials,
  ProviderIdSchema,
  setActiveModel,
  storedProviders,
} from "./config";
import { formatProfile, formatSignals, formatState } from "./format";
import { catalogFor, type Catalog } from "./i18n";
import { buildProvider, MODEL_CHOICES } from "./models";
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

const HELP = [
  "/state [--json]  /profile [--json]  /signals  /prefs [key value]",
  "/model [name]  /provider [name]  /reset",
  "/index  /undo  /forget <concept|all>  /clear  /cost  /stop  /exit",
].join("\n");

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

async function ensureDaemon(
  repoRoot: string,
  strings: Catalog,
): Promise<DaemonClient> {
  const path = socketPath(repoRoot, HIBI_HOME);

  try {
    const client = new DaemonClient();
    await client.connect(path);
    return client;
  } catch {
    stdout.write(`${ui.dim(strings.starting)}\n`);
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

function opening(strings: Catalog, repoRoot: string, indexed: boolean): string {
  const lines = [
    ui.dim(`${strings.repoLabel}: ${repoRoot}`),
    indexed ? "" : ui.dim(strings.notIndexed),
    "",
    strings.opening,
    "",
  ];
  return lines.filter((line) => line.length > 0).join("\n");
}

async function chat(repoRoot: string): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  rl.on("SIGINT", () => rl.close());

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

  const storage = new StorageLocal(HIBI_HOME);
  const learner = await storage.loadLearnerModel(LOCAL_USER);
  const strings = catalogFor(learner?.preferences.language ?? "en");

  const client = await ensureDaemon(repoRoot, strings);
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
        {
          inputTokens: event.inputTokens,
          cachedInputTokens: event.cachedInputTokens,
          outputTokens: event.outputTokens,
        },
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
    } else if (event.type === "signals") {
      stdout.write(`${formatSignals(event.payload as InferredSignal[])}\n`);
    }
  });

  stdout.write(`\n${banner(provider.model, repoRoot)}`);
  stdout.write(`${opening(strings, repoRoot, indexed)}\n`);

  for (;;) {
    let line: string;
    try {
      line = await rl.question(ui.prompt());
    } catch {
      stdout.write("\n");
      break;
    }

    const text = line.trim();
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
    if (text === "/signals") {
      await client.sendAndWait({ type: "signals" });
      continue;
    }
    if (text.startsWith("/prefs")) {
      await handlePrefs(text, client, storage, strings);
      continue;
    }
    if (text.startsWith("/model")) {
      await handleModel(text, strings);
      continue;
    }
    if (text.startsWith("/provider")) {
      await handleProvider(text, strings);
      continue;
    }
    if (text === "/reset") {
      await handleReset(rl, strings);
      continue;
    }
    if (text === "/index") {
      await client.sendAndWait({ type: "reindex" });
      continue;
    }
    if (text === "/undo") {
      await client.sendAndWait({ type: "undo" });
      continue;
    }
    if (text.startsWith("/forget")) {
      await handleForget(text, client, rl, strings);
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
      stdout.write(ui.dim(`unknown command\n${HELP}\n`));
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
  strings: Catalog,
): Promise<void> {
  const [, key, ...rest] = input.split(/\s+/);
  const value = rest.join(" ").trim();

  if (key === undefined || value.length === 0) {
    const learner = await storage.loadLearnerModel(LOCAL_USER);
    if (learner === null) {
      stdout.write(ui.dim(`${strings.noProfile}\n`));
      return;
    }
    for (const name of PREFERENCE_KEYS) {
      const current = learner.preferences[name];
      stdout.write(
        `  ${name} = ${current === "" ? ui.dim("(unset)") : current}\n`,
      );
    }
    stdout.write(ui.dim(`  ${strings.changeWith}\n`));
    return;
  }

  await client.sendAndWait({ type: "set_preference", key, value });
}

async function handleModel(input: string, strings: Catalog): Promise<void> {
  const [, model] = input.split(/\s+/);
  const current = await loadCredentials();

  if (model === undefined) {
    stdout.write(`  ${ui.bold("current")}: ${current?.model ?? "none"}\n`);

    if (current !== null) {
      for (const choice of MODEL_CHOICES[current.provider]) {
        stdout.write(`  ${choice.label} ${ui.dim(`— ${choice.note}`)}\n`);
      }
    }
    stdout.write(ui.dim("  /model <name>\n"));
    return;
  }

  const updated = await setActiveModel(model);
  if (updated === null) {
    stdout.write(ui.dim(`  ${strings.noProfile}\n`));
    return;
  }

  stdout.write(ui.dim(`  ${strings.restartNeeded}\n`));
}

/** Switches provider among those with a stored key */
async function handleProvider(input: string, strings: Catalog): Promise<void> {
  const [, name] = input.split(/\s+/);
  const stored = await storedProviders();

  if (name === undefined) {
    const current = await loadCredentials();
    stdout.write(`  ${ui.bold("active")}: ${current?.provider ?? "none"}\n`);
    stdout.write(`  ${ui.dim(`stored: ${stored.join(", ") || "none"}`)}\n`);
    stdout.write(ui.dim("  /provider openai | anthropic\n"));
    return;
  }

  const parsed = ProviderIdSchema.safeParse(name);
  if (!parsed.success) {
    stdout.write(ui.dim("  unknown provider\n"));
    return;
  }

  const activated = await activateProvider(parsed.data);
  if (activated === null) {
    stdout.write(
      ui.dim(`  no key stored for ${parsed.data} — run /reset to add one\n`),
    );
    return;
  }

  stdout.write(ui.dim(`  ${strings.restartNeeded}\n`));
}

/** Removes stored credentials so the next run goes through onboarding again */
async function handleReset(rl: Interface, strings: Catalog): Promise<void> {
  const answer = (await rl.question(`  ${strings.confirmReset} [y/N]: `))
    .trim()
    .toLowerCase();
  if (answer !== "y") return;

  await clearCredentials();
  stdout.write(ui.dim(`  ${strings.restartNeeded}\n`));
}

async function handleForget(
  input: string,
  client: DaemonClient,
  rl: Interface,
  strings: Catalog,
): Promise<void> {
  const [, target] = input.split(/\s+/);

  if (target === undefined) {
    stdout.write(ui.dim("  /forget <concept> | /forget all\n"));
    return;
  }

  if (target !== "all") {
    await client.sendAndWait({
      type: "forget",
      scope: "concept",
      value: target,
    });
    return;
  }

  stdout.write(`  ${strings.forgetWarning}\n`);
  const answer = (await rl.question(`  ${strings.typeForget} `))
    .trim()
    .toLowerCase();
  if (answer !== "forget") return;

  await client.sendAndWait({ type: "forget", scope: "all" });
}

const [command] = process.argv.slice(2);
const repoRoot = await findRepoRoot(process.cwd());

if (command === "daemon") await runDaemon(repoRoot);
else if (command === "chat" || command === undefined) await chat(repoRoot);
else {
  process.stderr.write("usage: hibi | hibi chat | hibi daemon\n");
  process.exit(1);
}
