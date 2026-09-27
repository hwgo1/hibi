import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

export const HIBI_HOME = join(homedir(), ".hibi");

export const ProviderIdSchema = z.enum(["openai", "anthropic"]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const CredentialsSchema = z.object({
  provider: ProviderIdSchema,
  apiKey: z.string().min(1),
  model: z.string().min(1),
});

export type Credentials = z.infer<typeof CredentialsSchema>;

const StoredEntrySchema = z.object({
  apiKey: z.string().min(1),
  model: z.string().min(1),
});

const CREDENTIALS_SCHEMA_VERSION = 2;

const CredentialStoreSchema = z.object({
  schemaVersion: z.literal(CREDENTIALS_SCHEMA_VERSION),
  active: ProviderIdSchema,
  providers: z.object({
    openai: StoredEntrySchema.optional(),
    anthropic: StoredEntrySchema.optional(),
  }),
});

type CredentialStore = z.infer<typeof CredentialStoreSchema>;

const CREDENTIALS_PATH = join(HIBI_HOME, "credentials.json");

export function credentialsPath(): string {
  return CREDENTIALS_PATH;
}

export async function loadCredentials(): Promise<Credentials | null> {
  const fromEnv = credentialsFromEnv();
  if (fromEnv !== null) return fromEnv;

  const store = await readStore();
  if (store === null) return null;

  const entry = store.providers[store.active];
  if (entry === undefined) return null;

  return { provider: store.active, ...entry };
}

export async function saveCredentials(credentials: Credentials): Promise<void> {
  const existing = await readStore();

  const store: CredentialStore = {
    schemaVersion: CREDENTIALS_SCHEMA_VERSION,
    active: credentials.provider,
    providers: {
      ...existing?.providers,
      [credentials.provider]: {
        apiKey: credentials.apiKey,
        model: credentials.model,
      },
    },
  };

  await writeStore(store);
}

export async function activateProvider(
  provider: ProviderId,
): Promise<Credentials | null> {
  const store = await readStore();
  const entry = store?.providers[provider];
  if (store === null || entry === undefined) return null;

  await writeStore({ ...store, active: provider });
  return { provider, ...entry };
}

export async function setActiveModel(
  model: string,
): Promise<Credentials | null> {
  const store = await readStore();
  const entry = store?.providers[store.active];
  if (store === null || entry === undefined) return null;

  const updated: CredentialStore = {
    ...store,
    providers: { ...store.providers, [store.active]: { ...entry, model } },
  };

  await writeStore(updated);
  return { provider: store.active, apiKey: entry.apiKey, model };
}

export async function storedProviders(): Promise<ProviderId[]> {
  const store = await readStore();
  if (store === null) return [];

  return (Object.keys(store.providers) as ProviderId[]).filter(
    (provider) => store.providers[provider] !== undefined,
  );
}

export async function clearCredentials(): Promise<void> {
  await rm(CREDENTIALS_PATH, { force: true });
}

async function readStore(): Promise<CredentialStore | null> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(CREDENTIALS_PATH, "utf8"));
  } catch {
    return null;
  }

  const current = CredentialStoreSchema.safeParse(raw);
  if (current.success) return current.data;

  const legacy = CredentialsSchema.safeParse(raw);
  if (!legacy.success) return null;

  return {
    schemaVersion: CREDENTIALS_SCHEMA_VERSION,
    active: legacy.data.provider,
    providers: {
      [legacy.data.provider]: {
        apiKey: legacy.data.apiKey,
        model: legacy.data.model,
      },
    },
  };
}

async function writeStore(store: CredentialStore): Promise<void> {
  await mkdir(HIBI_HOME, { recursive: true });

  const tmp = `${CREDENTIALS_PATH}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(store, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(tmp, CREDENTIALS_PATH);
  await chmod(CREDENTIALS_PATH, 0o600);
}

function credentialsFromEnv(): Credentials | null {
  const model = process.env["HIBI_MODEL"];

  const openai = process.env["OPENAI_API_KEY"];
  if (openai !== undefined) {
    return { provider: "openai", apiKey: openai, model: model ?? "gpt-4.1" };
  }

  const anthropic = process.env["ANTHROPIC_API_KEY"];
  if (anthropic !== undefined) {
    return {
      provider: "anthropic",
      apiKey: anthropic,
      model: model ?? "claude-sonnet-4-6",
    };
  }

  return null;
}
