import { stdout } from "node:process";

import { isKnownLanguage, PROVIDER_KEY_URLS, type ProviderId } from "@hibi/core";
import type { Settings } from "@hibi/daemon";

import type { DaemonClient } from "./client";
import { catalogFor, fill, type Catalog } from "./i18n";
import { ui } from "./render";

const MAX_NAME_LENGTH = 40;

/** Aligns step content under the step title, past "  1/3 " */
const INDENT = "      ";

const REFUSED_KEY = /401|incorrect api key|invalid.*key|authentication/i;

/** Answers that confirm the detected language. Checked before validation, since "si" is also a language tag */
const CONFIRMATIONS = new Set(["", "y", "yes", "s", "sim", "si", "sí", "ok"]);

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

/** What a typed answer to "is your language X?" means: the detected language, another known one, or nothing usable */
export function chosenLanguage(answer: string, detected: string): string | null {
  const trimmed = answer.trim();
  if (CONFIRMATIONS.has(trimmed.toLowerCase())) return detected;
  return isKnownLanguage(trimmed) ? trimmed : null;
}

/** Shows a prompt and resolves with the typed line */
export type Ask = (prompt: string) => Promise<string>;

/**
 * Asks only for what the daemon is missing: language and name, then a key.
 * Everything is saved by the daemon. Resolves with the learner's language
 */
export async function runOnboarding(
  ask: Ask,
  client: DaemonClient,
  settings: Settings,
): Promise<string> {
  const detected = detectLanguage();
  const total =
    (settings.profile === null ? 2 : 0) + (settings.provider === null ? 1 : 0);
  let step = 0;
  let language = settings.profile?.language ?? detected;

  const opening = catalogFor(language);
  stdout.write(`\n  ${ui.bold(ui.fox("hibi"))} ${ui.dim("日々")}\n`);

  if (settings.profile === null) {
    stdout.write(`\n  ${opening.onboardIntro}\n`);
    say(opening.onboardIntroDetail, { indent: "  ", dim: true });

    heading(++step, total, opening.stepLanguage);
    language = await askLanguage(ask, opening, detected);
    const strings = catalogFor(language);

    heading(++step, total, strings.stepName);
    const name = await askName(ask, strings);
    await client.call({ type: "set_profile", language, name });
  }

  const strings = catalogFor(language);

  if (settings.provider === null) {
    heading(++step, total, strings.stepKey);
    await askKey(ask, client, strings);
  }

  stdout.write(`\n  ${strings.ready}\n\n`);
  return language;
}

async function askLanguage(
  ask: Ask,
  strings: Catalog,
  detected: string,
): Promise<string> {
  const question = fill(strings.languageConfirm, {
    language: languageName(detected),
  });

  for (;;) {
    const answer = await ask(`${INDENT}${question} `);
    const language = chosenLanguage(answer, detected);
    if (language !== null) return language;
  }
}

async function askName(ask: Ask, strings: Catalog): Promise<string> {
  const answer = (await ask(`${INDENT}${strings.namePrompt} `)).trim();
  return answer.slice(0, MAX_NAME_LENGTH);
}

/**
 * Asks for a provider and a key until the daemon accepts one. A refused key
 * sends the learner back to the provider choice
 */
async function askKey(
  ask: Ask,
  client: DaemonClient,
  strings: Catalog,
): Promise<void> {
  say(strings.keyExplain, { dim: true });

  for (;;) {
    stdout.write("\n");
    say(strings.providerPrompt);
    stdout.write(`${INDENT}  ${ui.fox("1")}  OpenAI\n`);
    stdout.write(`${INDENT}  ${ui.fox("2")}  Anthropic\n`);

    const choice = (
      await ask(`${INDENT}${strings.choosePrompt} `)
    ).trim();
    const provider: ProviderId = choice === "2" ? "anthropic" : "openai";

    stdout.write("\n");
    say(fill(strings.keyWhere, { url: PROVIDER_KEY_URLS[provider] }), {
      dim: true,
    });

    const apiKey = await readKey(ask, strings);

    stdout.write(`${INDENT}${ui.dim(strings.keyChecking)} `);
    const events = await client.call({ type: "set_key", provider, apiKey });
    const refusal = events.find((event) => event.type === "error");

    if (refusal === undefined) {
      stdout.write(`${strings.keyOk}\n`);
      say(strings.keySaved, { dim: true });
      return;
    }

    const reason = refusal.type === "error" ? refusal.message : "";
    stdout.write(`${describeFailure(reason, strings)}\n`);
  }
}

/**
 * Reads the key, then rewrites the line with all but the last four characters
 * hidden, so the key does not stay readable in the terminal's scrollback
 */
async function readKey(ask: Ask, strings: Catalog): Promise<string> {
  for (;;) {
    const prompt = `${INDENT}${strings.keyPrompt} `;
    const key = (await ask(prompt)).trim();

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
