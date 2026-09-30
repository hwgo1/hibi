import type { Interface } from "node:readline/promises";

import {
  DEFAULT_TEACHING_PREFERENCES,
  StorageLocal,
  systemClock,
  type LearnerModel,
  type UserId,
} from "@hibi/core";

import {
  credentialsPath,
  saveCredentials,
  type Credentials,
  type ProviderId,
} from "./config";
import { MODEL_CHOICES, PROVIDER_KEY_URLS, verifyCredentials } from "./models";
import { ui } from "./render";

const LOCAL_USER = "local" as UserId;
const MAX_NAME_LENGTH = 40;

export function detectLanguage(): string {
  const fromEnv = process.env["LANG"] ?? process.env["LC_ALL"];
  if (fromEnv !== undefined) {
    const tag = fromEnv.split(".")[0]?.replace("_", "-");
    if (tag !== undefined && tag.length >= 2) return tag;
  }
  return Intl.DateTimeFormat().resolvedOptions().locale;
}

export async function runOnboarding(
  rl: Interface,
  home: string,
): Promise<Credentials> {
  process.stdout.write(`\n${ui.fox("hibi")} ${ui.dim("日々")}\n`);
  process.stdout.write(ui.dim("first run — this takes about a minute\n\n"));

  const provider = await askProvider(rl);
  const apiKey = await askApiKey(rl, provider);
  const model = await askModel(rl, provider);

  const credentials: Credentials = { provider, apiKey, model };

  process.stdout.write(ui.dim("\nchecking the key… "));
  const failure = await verifyCredentials(credentials);

  if (failure !== null) {
    process.stdout.write(`failed\n${failure}\n\n`);
    return runOnboarding(rl, home);
  }

  process.stdout.write("ok\n");
  await saveCredentials(credentials);
  process.stdout.write(
    ui.dim(`key stored in ${credentialsPath()} (owner-only)\n\n`),
  );

  await setupProfile(rl, home);
  return credentials;
}

async function askProvider(rl: Interface): Promise<ProviderId> {
  process.stdout.write(`${ui.bold("provider")}\n  1) OpenAI\n  2) Anthropic\n`);
  const answer = (await rl.question("  choice [1]: ")).trim();
  return answer === "2" ? "anthropic" : "openai";
}

async function askApiKey(rl: Interface, provider: ProviderId): Promise<string> {
  process.stdout.write(`\n${ui.bold("api key")}\n`);
  process.stdout.write(ui.dim(`  get one at ${PROVIDER_KEY_URLS[provider]}\n`));

  for (;;) {
    const key = (await rl.question("  paste it here: ")).trim();
    if (key.length > 0) return key;
    process.stdout.write(ui.dim("  a key is required\n"));
  }
}

async function askModel(rl: Interface, provider: ProviderId): Promise<string> {
  const choices = MODEL_CHOICES[provider];
  process.stdout.write(`\n${ui.bold("model")}\n`);

  for (const [index, choice] of choices.entries()) {
    process.stdout.write(
      `  ${index + 1}) ${choice.label} ${ui.dim(`— ${choice.note}`)}\n`,
    );
  }

  const answer = (await rl.question("  choice [1]: ")).trim();
  const picked = choices[Number.parseInt(answer, 10) - 1] ?? choices[0]!;
  return picked.id;
}

async function setupProfile(rl: Interface, home: string): Promise<void> {
  const storage = new StorageLocal(home);
  if ((await storage.loadLearnerModel(LOCAL_USER)) !== null) return;

  const detected = detectLanguage();
  process.stdout.write(`${ui.bold("language")}\n`);
  const language = (
    await rl.question(
      `  detected ${detected} — press enter to keep, or type another: `,
    )
  ).trim();

  process.stdout.write(`\n${ui.bold("name")}\n`);
  const name = (
    await rl.question("  what should I call you? (enter to skip): ")
  ).trim();

  const at = systemClock.now().toISOString();
  const learner: LearnerModel = {
    schemaVersion: 1,
    userId: LOCAL_USER,
    createdAt: at,
    updatedAt: at,
    preferences: {
      ...DEFAULT_TEACHING_PREFERENCES,
      language: language.length > 0 ? language : detected,
      name: name.slice(0, MAX_NAME_LENGTH),
    },
    goal: null,
    mastery: [],
    recurringErrors: [],
    inferredSignals: [],
  };

  await storage.saveLearnerModel(learner);
  process.stdout.write(ui.dim("  saved — change anything later with /prefs\n"));
}
