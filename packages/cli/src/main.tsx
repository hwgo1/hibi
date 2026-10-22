#!/usr/bin/env bun
import { render } from "ink";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

import {
  MODEL_CHOICES,
  ProviderIdSchema,
  type InferredSignal,
  type LearnerModel,
  type SessionState,
} from "@hibi/core";
import {
  Daemon,
  findRepoRoot,
  serve,
  socketPath,
  type RequestBody,
  type Settings,
} from "@hibi/daemon";

import { DaemonClient } from "./client";
import { formatProfile, formatSignals, formatState } from "./format";
import { helpFor } from "./help";
import { catalogFor, fill, type Catalog } from "./i18n";
import { detectLanguage, runOnboarding } from "./onboarding";
import { banner, ui } from "./render";
import { App, type CommandResult } from "./ui/App";
import type { WelcomeContent } from "./ui/Welcome";

const HIBI_HOME = join(homedir(), ".hibi");

const PREFERENCE_KEYS = [
  "name",
  "language",
  "theoryDepth",
  "exerciseSize",
  "unsolicitedHints",
  "explanationStyle",
] as const;

async function runDaemon(): Promise<void> {
  await serve(new Daemon({ home: HIBI_HOME }), HIBI_HOME);

  stdout.write(banner());
  stdout.write(ui.dim(`listening on ${socketPath(HIBI_HOME)}\n`));

  await new Promise(() => {});
}

/**
 * Starts the user's daemon in its own session, so closing or interrupting
 * this terminal leaves it running for every other client. It runs from the
 * home directory, so it never holds a project folder open, and writes its
 * errors to `run/daemon.log`
 */
function spawnDaemon(): void {
  const runDir = join(HIBI_HOME, "run");
  mkdirSync(runDir, { recursive: true });

  Bun.spawn(["bun", import.meta.path, "daemon"], {
    cwd: homedir(),
    detached: true,
    windowsHide: true,
    stdin: "ignore",
    stdout: "ignore",
    stderr: Bun.file(join(runDir, "daemon.log")),
  }).unref();
}

async function chat(repoRoot: string): Promise<void> {
  let rendering = false;
  const early = catalogFor(detectLanguage());

  const client = new DaemonClient({
    path: socketPath(HIBI_HOME),
    root: repoRoot,
    start: () => {
      if (!rendering) stdout.write(`${ui.dim(early.starting)}\n`);
      spawnDaemon();
    },
  });

  const refusal = await client.open();
  if (refusal !== null) {
    process.stderr.write(`${refusal}\n`);
    return;
  }

  let settings = await readSettings(client);
  if (settings.profile === null || settings.provider === null) {
    if (!(await onboard(client, settings))) {
      client.close();
      return;
    }
    settings = await readSettings(client);
  }

  const learner = await readProfile(client);
  const language = learner.preferences.language;
  const strings = catalogFor(language);

  rendering = true;
  const { waitUntilExit } = render(
    <App
      client={client}
      welcome={welcomeFor(repoRoot, learner, strings, settings)}
      strings={strings}
      help={helpFor(language)}
      onCommand={(input) => handleCommand(input, client, strings)}
    />,
  );

  await waitUntilExit();
  client.close();
}

/**
 * Runs onboarding in the terminal. False when the learner leaves it with
 * ctrl+c or the input ends: closing the reader aborts the pending question,
 * which closing alone does not
 */
async function onboard(
  client: DaemonClient,
  settings: Settings,
): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout });
  const abort = new AbortController();
  rl.on("SIGINT", () => rl.close());
  rl.on("close", () => abort.abort());

  try {
    await runOnboarding(
      (prompt) => rl.question(prompt, { signal: abort.signal }),
      client,
      settings,
    );
    return true;
  } catch {
    stdout.write("\n");
    return false;
  } finally {
    rl.close();
  }
}

async function readSettings(client: DaemonClient): Promise<Settings> {
  for (const event of await client.call({ type: "settings" })) {
    if (event.type === "settings") return event.payload;
  }
  throw new Error("the daemon sent no settings");
}

async function readProfile(client: DaemonClient): Promise<LearnerModel> {
  for (const event of await client.call({ type: "profile" })) {
    if (event.type === "profile" && event.payload !== null) {
      return event.payload as LearnerModel;
    }
  }
  throw new Error("the daemon has no profile");
}

function welcomeFor(
  repoRoot: string,
  learner: LearnerModel,
  strings: Catalog,
  settings: Settings,
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

  if (!settings.meetsTutorBaseline && settings.model !== null) {
    lines.push({
      text: fill(strings.weakModel, { model: settings.model }),
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
  strings: Catalog,
): Promise<CommandResult> {
  const raw = input.replace(/\s+--json\b/, "");
  const showRaw = input.includes("--json");
  const [command, argument] = raw.split(/\s+/);

  switch (command) {
    case "/help":
      return { help: argument === "all" ? "full" : "short" };

    case "/state":
      return query(client, { type: "state" }, (payload) =>
        showRaw
          ? JSON.stringify(payload, null, 2)
          : formatState(payload as SessionState),
      );

    case "/profile":
      return query(client, { type: "profile" }, (payload) =>
        showRaw
          ? JSON.stringify(payload, null, 2)
          : formatProfile(payload as LearnerModel),
      );

    case "/signals":
      return query(client, { type: "signals" }, (payload) =>
        formatSignals(payload as InferredSignal[]),
      );

    case "/prefs":
      return handlePrefs(raw, client, strings);

    case "/model":
      return handleModel(argument, client, strings);

    case "/provider":
      return handleProvider(argument, client, strings);

    case "/reset": {
      const result = await perform(client, { type: "forget_key" });
      return result.error === undefined ? { notice: strings.keyRemoved } : result;
    }

    case "/index":
      return perform(client, { type: "reindex" });

    case "/undo":
      return perform(client, { type: "undo" });

    case "/clear":
      return perform(client, { type: "clear" });

    case "/forget":
      return handleForget(raw, client, strings);

    case "/stop":
      await client.request({ type: "shutdown" });
      return { exit: true };

    default:
      return { output: strings.unknownCommand };
  }
}

/** Sends a command and shows the daemon's confirmation or error */
async function perform(
  client: DaemonClient,
  body: RequestBody,
): Promise<CommandResult> {
  const result: CommandResult = {};

  for (const event of await client.call(body)) {
    if (event.type === "ok") result.notice = event.message;
    if (event.type === "error") result.error = event.message;
  }
  return result;
}

/** Sends a query and formats the payload it returns */
async function query(
  client: DaemonClient,
  body: RequestBody,
  format: (data: unknown) => string,
): Promise<CommandResult> {
  const result: CommandResult = {};

  for (const event of await client.call(body)) {
    if (
      event.type === "state" ||
      event.type === "profile" ||
      event.type === "signals"
    ) {
      result.output = format(event.payload);
    }
    if (event.type === "error") result.error = event.message;
  }
  return result;
}

async function handlePrefs(
  input: string,
  client: DaemonClient,
  strings: Catalog,
): Promise<CommandResult> {
  const [, key, ...rest] = input.split(/\s+/);
  const value = rest.join(" ").trim();

  if (key === undefined || value.length === 0) {
    const learner = await readProfile(client);
    const lines = PREFERENCE_KEYS.map((name) => {
      const current = learner.preferences[name];
      return `${name.padEnd(18)} ${current === "" ? "—" : current}`;
    });

    return { output: [...lines, "", strings.changeWith].join("\n") };
  }

  return perform(client, { type: "set_preference", key, value });
}

/** Lists the active provider's models, or switches to one; the switch applies to the next message */
async function handleModel(
  model: string | undefined,
  client: DaemonClient,
  strings: Catalog,
): Promise<CommandResult> {
  if (model !== undefined) {
    const result = await perform(client, { type: "set_model", model });
    return result.error === undefined
      ? { notice: fill(strings.nowUsing, { model }) }
      : result;
  }

  const settings = await readSettings(client);
  const options =
    settings.provider === null
      ? []
      : MODEL_CHOICES[settings.provider].map(
          (choice) => `${choice.label.padEnd(26)} ${choice.note}`,
        );
  return { output: [settings.model ?? "—", "", ...options].join("\n") };
}

/** Shows the providers with a saved key, or switches to one of them */
async function handleProvider(
  name: string | undefined,
  client: DaemonClient,
  strings: Catalog,
): Promise<CommandResult> {
  if (name === undefined) {
    const settings = await readSettings(client);
    return {
      output: [
        settings.provider ?? "—",
        "",
        "openai · anthropic",
        `(${settings.storedProviders.join(", ")})`,
      ].join("\n"),
    };
  }

  const parsed = ProviderIdSchema.safeParse(name);
  if (!parsed.success) return { output: strings.unknownCommand };

  const result = await perform(client, {
    type: "set_provider",
    provider: parsed.data,
  });
  if (result.error !== undefined) return result;

  const settings = await readSettings(client);
  return { notice: fill(strings.nowUsing, { model: settings.model ?? name }) };
}

async function handleForget(
  input: string,
  client: DaemonClient,
  strings: Catalog,
): Promise<CommandResult> {
  const [, target, confirmation] = input.split(/\s+/);

  if (target === undefined) return { help: "full" };

  if (target !== "all") {
    return perform(client, { type: "forget", scope: "concept", value: target });
  }

  if (confirmation !== "forget") return { output: strings.forgetWarning };

  return perform(client, { type: "forget", scope: "all" });
}

const [command] = process.argv.slice(2);

if (command === "daemon") await runDaemon();
else if (command === "chat" || command === undefined) {
  await chat(await findRepoRoot(process.cwd()));
} else {
  process.stderr.write("usage: hibi | hibi chat | hibi daemon\n");
  process.exit(1);
}
