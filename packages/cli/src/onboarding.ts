import { stdout } from "node:process";
import type { Interface } from "node:readline/promises";

import {
  DEFAULT_TEACHING_PREFERENCES,
  StorageLocal,
  systemClock,
  type LearnerModel,
  type UserId,
} from "@hibi/core";

import { saveCredentials, type Credentials, type ProviderId } from "./config";
import { catalogFor, fill, type Catalog } from "./i18n";
import { MODEL_CHOICES, PROVIDER_KEY_URLS, verifyCredentials } from "./models";
import { ui } from "./render";

const LOCAL_USER = "local" as UserId;
const MAX_NAME_LENGTH = 40;

/** Aligns step content under the step title, past "  1/3 " */
const INDENT = "      ";

const REFUSED_KEY = /401|incorrect api key|invalid.*key|authentication/i;

export interface OnboardingState {
  credentials: Credentials | null;
  learner: LearnerModel | null;
}

export interface OnboardingResult {
  credentials: Credentials;
  learner: LearnerModel;
}

export function detectLanguage(): string {
  const fromEnv = process.env["LANG"] ?? process.env["LC_ALL"];
  if (fromEnv !== undefined) {
    const tag = fromEnv.split(".")[0]?.replace("_", "-");
    if (tag !== undefined && tag.length >= 2 && tag !== "C") return tag;
  }
  return Intl.DateTimeFormat().resolvedOptions().locale;
}

export function languageName(tag: string): string {
  try {
    return new Intl.DisplayNames([tag], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

export async function runOnboarding(
  rl: Interface,
  home: string,
  state: OnboardingState,
): Promise<OnboardingResult> {
  const storage = new StorageLocal(home);
  const detected = detectLanguage();
  const total =
    (state.learner === null ? 2 : 0) + (state.credentials === null ? 1 : 0);
  let step = 0;

  const opening = catalogFor(state.learner?.preferences.language ?? detected);
  stdout.write(`\n  ${ui.bold(ui.fox("hibi"))} ${ui.dim("日々")}\n`);

  if (state.learner === null) {
    stdout.write(`\n  ${opening.onboardIntro}\n`);
    say(opening.onboardIntroDetail, { indent: "  ", dim: true });
  }

  let learner = state.learner;

  if (learner === null) {
    heading(++step, total, opening.stepLanguage);
    const language = await askLanguage(rl, opening, detected);
    const strings = catalogFor(language);

    heading(++step, total, strings.stepName);
    const name = await askName(rl, strings);

    learner = newLearner(language, name);
    await storage.saveLearnerModel(learner);
  }

  const strings = catalogFor(learner.preferences.language);
  let credentials = state.credentials;

  if (credentials === null) {
    heading(++step, total, strings.stepKey);
    credentials = await askKey(rl, strings);
  }

  stdout.write(`\n  ${strings.ready}\n\n`);
  return { credentials, learner };
}

async function askLanguage(
  rl: Interface,
  strings: Catalog,
  detected: string,
): Promise<string> {
  const question = fill(strings.languageConfirm, {
    language: languageName(detected),
  });
  const answer = (await rl.question(`${INDENT}${question} `)).trim();
  return answer.length >= 2 ? answer : detected;
}

async function askName(rl: Interface, strings: Catalog): Promise<string> {
  const answer = (await rl.question(`${INDENT}${strings.namePrompt} `)).trim();
  return answer.slice(0, MAX_NAME_LENGTH);
}

/**
 * Asks for a provider and a key until a key works. A refused key sends the
 * learner back to the provider choice
 */
async function askKey(rl: Interface, strings: Catalog): Promise<Credentials> {
  say(strings.keyExplain, { dim: true });

  for (;;) {
    stdout.write("\n");
    say(strings.providerPrompt);
    stdout.write(`${INDENT}  ${ui.fox("1")}  OpenAI\n`);
    stdout.write(`${INDENT}  ${ui.fox("2")}  Anthropic\n`);

    const choice = (
      await rl.question(`${INDENT}${strings.choosePrompt} `)
    ).trim();
    const provider: ProviderId = choice === "2" ? "anthropic" : "openai";

    stdout.write("\n");
    say(fill(strings.keyWhere, { url: PROVIDER_KEY_URLS[provider] }), {
      dim: true,
    });

    const apiKey = await readKey(rl, strings);
    const credentials: Credentials = {
      provider,
      apiKey,
      model: MODEL_CHOICES[provider][0]!.id,
    };

    stdout.write(`${INDENT}${ui.dim(strings.keyChecking)} `);
    const failure = await verifyCredentials(credentials);

    if (failure === null) {
      stdout.write(`${strings.keyOk}\n`);
      await saveCredentials(credentials);
      say(strings.keySaved, { dim: true });
      return credentials;
    }

    stdout.write(`${describeFailure(failure, strings)}\n`);
  }
}

/**
 * Reads the key, then rewrites the line with all but the last four characters
 * hidden, so the key does not stay readable in the terminal's scrollback
 */
async function readKey(rl: Interface, strings: Catalog): Promise<string> {
  for (;;) {
    const prompt = `${INDENT}${strings.keyPrompt} `;
    const key = (await rl.question(prompt)).trim();

    if (key.length === 0) {
      say(strings.keyRequired, { dim: true });
      continue;
    }

    if (stdout.isTTY === true) {
      stdout.write(`\x1b[1A\x1b[2K${prompt}${"•".repeat(8)}${key.slice(-4)}\n`);
    }
    return key;
  }
}

function describeFailure(failure: string, strings: Catalog): string {
  if (REFUSED_KEY.test(failure)) return strings.keyInvalid;
  const reason = failure.length > 80 ? `${failure.slice(0, 79)}…` : failure;
  return fill(strings.keyFailed, { reason });
}

function newLearner(language: string, name: string): LearnerModel {
  const at = systemClock.now().toISOString();
  return {
    schemaVersion: 1,
    userId: LOCAL_USER,
    createdAt: at,
    updatedAt: at,
    preferences: { ...DEFAULT_TEACHING_PREFERENCES, language, name },
    goal: null,
    mastery: [],
    recurringErrors: [],
    inferredSignals: [],
  };
}

function heading(step: number, total: number, title: string): void {
  const counter = total > 1 ? `${step}/${total}` : "";
  stdout.write(`\n  ${ui.fox(counter.padEnd(3))} ${ui.bold(title)}\n`);
}

/** Writes each line of a possibly multi-line string at the step indent */
function say(
  text: string,
  options: { indent?: string; dim?: boolean } = {},
): void {
  const indent = options.indent ?? INDENT;
  for (const line of text.split("\n")) {
    stdout.write(`${indent}${options.dim === true ? ui.dim(line) : line}\n`);
  }
}
