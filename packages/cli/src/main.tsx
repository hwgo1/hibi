#!/usr/bin/env bun
import { render } from "ink";
import { homedir } from "node:os";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

import {
  StorageLocal,
  type InferredSignal,
  type LearnerModel,
  type LLMProvider,
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
import { helpFor } from "./help";
import { catalogFor, fill, type Catalog } from "./i18n";
import { buildProvider, MODEL_CHOICES } from "./models";
import {
  runOnboarding,
  type OnboardingResult,
  type OnboardingState,
} from "./onboarding";
import { banner, ui } from "./render";
import { App, type CommandResult } from "./ui/App";
import type { WelcomeContent } from "./ui/Welcome";

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

async function chat(repoRoot: string): Promise<void> {
  const storage = new StorageLocal(HIBI_HOME);
  const [storedCredentials, storedLearner] = await Promise.all([
    loadCredentials(),
    storage.loadLearnerModel(LOCAL_USER),
  ]);

  let credentials = storedCredentials;
  let learner = storedLearner;

  if (credentials === null || learner === null) {
    const setup = await onboard({ credentials, learner });
    if (setup === null) return;
    credentials = setup.credentials;
    learner = setup.learner;
  }

  const language = learner.preferences.language;
  const strings = catalogFor(language);
  const provider = buildProvider(credentials);
  const client = await ensureDaemon(repoRoot, strings);

  const { waitUntilExit } = render(
    <App
      client={client}
      welcome={welcomeFor(repoRoot, learner, strings, provider)}
      strings={strings}
      help={helpFor(language)}
      onCommand={(input) => handleCommand(input, client, storage, strings)}
    />,
  );

  await waitUntilExit();
  client.close();
}

async function onboard(
  state: OnboardingState,
): Promise<OnboardingResult | null> {
  const rl = createInterface({ input: stdin, output: stdout });
  rl.on("SIGINT", () => rl.close());

  try {
    return await runOnboarding(rl, HIBI_HOME, state);
  } catch {
    stdout.write("\n");
    return null;
  } finally {
    rl.close();
  }
}

function welcomeFor(
  repoRoot: string,
  learner: LearnerModel,
  strings: Catalog,
  provider: LLMProvider,
): WelcomeContent {
  const name = learner.preferences.name;
  const goal =
    learner.goal !== null && learner.goal.status === "active"
      ? learner.goal.statement
      : null;

  const lines: WelcomeContent["lines"] = [
    {
      text:
        name.length > 0
          ? fill(strings.greetingNamed, { name })
          : strings.greeting,
      dim: false,
    },
  ];

  if (goal !== null)
    lines.push({ text: fill(strings.resuming, { goal }), dim: false });
  lines.push({ text: strings.hint, dim: true });

  if (!provider.capabilities.meetsTutorBaseline) {
    lines.push({
      text: fill(strings.weakModel, { model: provider.model }),
      dim: true,
    });
  }

  return { path: abbreviateHome(repoRoot), lines };
}

function abbreviateHome(path: string): string {
  const home = homedir();
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

async function handleCommand(
  input: string,
  client: DaemonClient,
  storage: StorageLocal,
  strings: Catalog,
): Promise<CommandResult> {
  const raw = input.replace(/\s+--json\b/, "");
  const showRaw = input.includes("--json");
  const [command, argument] = raw.split(/\s+/);

  switch (command) {
    case "/help":
      return { help: argument === "all" ? "full" : "short" };

    case "/state":
      return {
        output: await query(client, { type: "state" }, (payload) =>
          showRaw
            ? JSON.stringify(payload, null, 2)
            : formatState(payload as SessionState),
        ),
      };

    case "/profile":
      return {
        output: await query(client, { type: "profile" }, (payload) =>
          showRaw
            ? JSON.stringify(payload, null, 2)
            : formatProfile(payload as LearnerModel),
        ),
      };

    case "/signals":
      return {
        output: await query(client, { type: "signals" }, (payload) =>
          formatSignals(payload as InferredSignal[]),
        ),
      };

    case "/prefs":
      return handlePrefs(raw, client, storage, strings);

    case "/model":
      return { output: await describeModel(raw, strings) };

    case "/provider":
      return { output: await describeProvider(raw, strings) };

    case "/reset":
      await clearCredentials();
      return { output: strings.restartNeeded };

    case "/index":
      await client.sendAndWait({ type: "reindex" });
      return {};

    case "/undo":
      await client.sendAndWait({ type: "undo" });
      return {};

    case "/clear":
      await client.sendAndWait({ type: "clear" });
      return {};

    case "/forget":
      return handleForget(raw, client, strings);

    case "/stop":
      await client.sendAndWait({ type: "shutdown" });
      return { exit: true };

    default:
      return { output: strings.unknownCommand };
  }
}

async function query(
  client: DaemonClient,
  payload: Parameters<DaemonClient["sendAndWait"]>[0],
  format: (data: unknown) => string,
): Promise<string> {
  let output = "";
  const previous = client.takeHandler();

  client.onEvent((event) => {
    if (
      event.type === "state" ||
      event.type === "profile" ||
      event.type === "signals"
    ) {
      output = format(event.payload);
      return;
    }
    previous?.(event);
  });

  await client.sendAndWait(payload);
  if (previous !== null) client.onEvent(previous);

  return output;
}

async function handlePrefs(
  input: string,
  client: DaemonClient,
  storage: StorageLocal,
  strings: Catalog,
): Promise<CommandResult> {
  const [, key, ...rest] = input.split(/\s+/);
  const value = rest.join(" ").trim();

  if (key === undefined || value.length === 0) {
    const learner = await storage.loadLearnerModel(LOCAL_USER);
    if (learner === null) return { output: strings.noProfile };

    const lines = PREFERENCE_KEYS.map((name) => {
      const current = learner.preferences[name];
      return `${name.padEnd(18)} ${current === "" ? "—" : current}`;
    });

    return { output: [...lines, "", strings.changeWith].join("\n") };
  }

  await client.sendAndWait({ type: "set_preference", key, value });
  return {};
}

async function describeModel(input: string, strings: Catalog): Promise<string> {
  const [, model] = input.split(/\s+/);
  const current = await loadCredentials();

  if (model === undefined) {
    const options =
      current === null
        ? []
        : MODEL_CHOICES[current.provider].map(
            (choice) => `${choice.label.padEnd(26)} ${choice.note}`,
          );
    return [current?.model ?? "—", "", ...options].join("\n");
  }

  const updated = await setActiveModel(model);
  return updated === null ? strings.noProfile : strings.restartNeeded;
}

async function describeProvider(
  input: string,
  strings: Catalog,
): Promise<string> {
  const [, name] = input.split(/\s+/);

  if (name === undefined) {
    const [current, stored] = await Promise.all([
      loadCredentials(),
      storedProviders(),
    ]);
    return [
      current?.provider ?? "—",
      "",
      `openai · anthropic`,
      `(${stored.join(", ")})`,
    ].join("\n");
  }

  const parsed = ProviderIdSchema.safeParse(name);
  if (!parsed.success) return strings.unknownCommand;

  const activated = await activateProvider(parsed.data);
  return activated === null ? strings.noProfile : strings.restartNeeded;
}

async function handleForget(
  input: string,
  client: DaemonClient,
  strings: Catalog,
): Promise<CommandResult> {
  const [, target, confirmation] = input.split(/\s+/);

  if (target === undefined) return { help: "full" };

  if (target !== "all") {
    await client.sendAndWait({
      type: "forget",
      scope: "concept",
      value: target,
    });
    return {};
  }

  if (confirmation !== "forget") return { output: strings.forgetWarning };

  await client.sendAndWait({ type: "forget", scope: "all" });
  return {};
}

const [command] = process.argv.slice(2);
const repoRoot = await findRepoRoot(process.cwd());

if (command === "daemon") await runDaemon(repoRoot);
else if (command === "chat" || command === undefined) await chat(repoRoot);
else {
  process.stderr.write("usage: hibi | hibi chat | hibi daemon\n");
  process.exit(1);
}
