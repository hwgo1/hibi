import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { ProviderIdSchema, type Credentials, type ProviderId } from "@hibi/core";
import { z } from "zod";

const EntrySchema = z.object({
  apiKey: z.string().min(1),
  model: z.string().min(1),
});

const StoreSchema = z.object({
  active: ProviderIdSchema,
  providers: z.object({
    openai: EntrySchema.optional(),
    anthropic: EntrySchema.optional(),
  }),
});

type Store = z.infer<typeof StoreSchema>;

/**
 * Keys and chosen models per provider, in `credentials.json` under the home,
 * readable only by the user. A key in OPENAI_API_KEY or ANTHROPIC_API_KEY wins
 * over the file, with HIBI_MODEL naming the model.
 */
export class CredentialStore {
  private readonly path: string;

  constructor(home: string) {
    this.path = join(home, "credentials.json");
  }

  async active(): Promise<Credentials | null> {
    const fromEnv = credentialsFromEnv();
    if (fromEnv !== null) return fromEnv;

    const store = await this.read();
    const entry = store?.providers[store.active];
    if (store === null || entry === undefined) return null;
    return { provider: store.active, ...entry };
  }

  async stored(): Promise<ProviderId[]> {
    const store = await this.read();
    if (store === null) return [];
    return ProviderIdSchema.options.filter(
      (provider) => store.providers[provider] !== undefined,
    );
  }

  /** Saves the key under its provider and makes that provider active */
  async save(credentials: Credentials): Promise<void> {
    const existing = await this.read();
    await this.write({
      active: credentials.provider,
      providers: {
        ...existing?.providers,
        [credentials.provider]: {
          apiKey: credentials.apiKey,
          model: credentials.model,
        },
      },
    });
  }

  /** Makes a provider with a saved key active. Null when it has none */
  async activate(provider: ProviderId): Promise<Credentials | null> {
    const store = await this.read();
    const entry = store?.providers[provider];
    if (store === null || entry === undefined) return null;

    await this.write({ ...store, active: provider });
    return { provider, ...entry };
  }

  /** Changes the active provider's model. Null when no key is saved */
  async setModel(model: string): Promise<Credentials | null> {
    const store = await this.read();
    const entry = store?.providers[store.active];
    if (store === null || entry === undefined) return null;

    await this.write({
      ...store,
      providers: { ...store.providers, [store.active]: { ...entry, model } },
    });
    return { provider: store.active, apiKey: entry.apiKey, model };
  }

  async clear(): Promise<void> {
    await rm(this.path, { force: true });
  }

  /** A file of another shape reads as no credentials, and the next save replaces it */
  private async read(): Promise<Store | null> {
    try {
      const parsed = StoreSchema.safeParse(
        JSON.parse(await readFile(this.path, "utf8")),
      );
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private async write(store: Store): Promise<void> {
    await mkdir(join(this.path, ".."), { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(store, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(tmp, this.path);
    await chmod(this.path, 0o600);
  }
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
