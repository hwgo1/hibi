import {
  createProvider,
  isKnownLanguage,
  loadLearner,
  meetsTutorBaseline,
  MODEL_CHOICES,
  TeachingPreferencesSchema,
  verifyCredentials,
  type Clock,
  type Credentials,
  type LLMProvider,
  type ProviderId,
  type StorageLocal,
  type UserId,
} from "@hibi/core";

import { ActiveProvider } from "./active-provider";
import { CredentialStore } from "./credentials";
import type { ClientRequest, Reply, Settings } from "./protocol";
import type { TurnQueue } from "./turn-queue";

export const LOCAL_USER = "local" as UserId;

const ACCOUNT_REQUESTS = [
  "profile",
  "signals",
  "set_preference",
  "settings",
  "set_profile",
  "set_key",
  "set_model",
  "set_provider",
  "forget_key",
] as const;

export type AccountRequest = Extract<
  ClientRequest,
  { type: (typeof ACCOUNT_REQUESTS)[number] }
>;

export function isAccountRequest(
  request: ClientRequest,
): request is AccountRequest {
  return (ACCOUNT_REQUESTS as readonly string[]).includes(request.type);
}

export interface AccountOptions {
  storage: StorageLocal;
  home: string;
  clock: Clock;
  queue: TurnQueue;
  /** Fixed provider, for tests. Without it the saved key decides */
  provider?: LLMProvider;
}

/**
 * Everything about the user that is not a space: the profile, the API key and
 * the provider every tutor talks to. Changes go through the daemon's queue,
 * so none lands in the middle of a turn
 */
export class Account {
  readonly provider: ActiveProvider;
  /** Settles once the saved key, if any, is in front of every tutor */
  readonly ready: Promise<void>;

  private readonly credentials: CredentialStore;

  constructor(private readonly options: AccountOptions) {
    this.credentials = new CredentialStore(options.home);
    this.provider = new ActiveProvider(options.provider ?? null);
    this.ready =
      options.provider === undefined
        ? this.loadSavedProvider()
        : Promise.resolve();
  }

  async answer(request: AccountRequest): Promise<Reply[]> {
    const { storage, queue } = this.options;

    switch (request.type) {
      case "profile":
        return [
          { type: "profile", payload: await storage.loadLearnerModel(LOCAL_USER) },
        ];

      case "signals": {
        const learner = await storage.loadLearnerModel(LOCAL_USER);
        return [{ type: "signals", payload: learner?.inferredSignals ?? [] }];
      }

      case "settings":
        return [{ type: "settings", payload: await this.settings() }];

      case "set_preference":
        return queue.run(() => this.setPreference(request.key, request.value));

      case "set_profile":
        return queue.run(() => this.setProfile(request.language, request.name));

      case "set_key":
        return this.setKey(request.provider, request.apiKey);

      case "set_model":
        return queue.run(async () =>
          this.switchTo(await this.credentials.setModel(request.model)),
        );

      case "set_provider":
        return queue.run(async () =>
          this.switchTo(await this.credentials.activate(request.provider)),
        );

      case "forget_key":
        return queue.run(async () => {
          await this.credentials.clear();
          await this.loadSavedProvider();
          return [{ type: "ok", message: "key removed" }];
        });
    }
  }

  private async loadSavedProvider(): Promise<void> {
    const saved = await this.credentials.active();
    this.provider.use(saved === null ? null : createProvider(saved));
  }

  private async settings(): Promise<Settings> {
    const [learner, active, storedProviders] = await Promise.all([
      this.options.storage.loadLearnerModel(LOCAL_USER),
      this.credentials.active(),
      this.credentials.stored(),
    ]);

    return {
      profile:
        learner === null
          ? null
          : {
              language: learner.preferences.language,
              name: learner.preferences.name,
            },
      provider: active?.provider ?? null,
      model: active?.model ?? null,
      storedProviders,
      meetsTutorBaseline: active !== null && meetsTutorBaseline(active.model),
    };
  }

  /**
   * Validates a single preference against the schema before writing, so an
   * unknown key or an invalid value is rejected
   */
  private async setPreference(key: string, value: string): Promise<Reply[]> {
    const { storage, clock } = this.options;
    const learner = await storage.loadLearnerModel(LOCAL_USER);
    if (learner === null) return [{ type: "error", message: "no profile yet" }];

    if (!Object.keys(learner.preferences).includes(key)) {
      return [{ type: "error", message: `unknown preference: ${key}` }];
    }

    const parsed = TeachingPreferencesSchema.safeParse({
      ...learner.preferences,
      [key]: value,
    });
    if (!parsed.success) {
      return [{ type: "error", message: `invalid value for ${key}: ${value}` }];
    }

    learner.preferences = parsed.data;
    learner.updatedAt = clock.now().toISOString();
    await storage.saveLearnerModel(learner);

    return [{ type: "ok", message: `${key} = ${value}` }];
  }

  /** Creates the profile on first run, or changes its language and name */
  private async setProfile(language: string, name: string): Promise<Reply[]> {
    if (!isKnownLanguage(language)) {
      return [{ type: "error", message: `not a language: ${language}` }];
    }

    const { storage, clock } = this.options;
    const learner = await loadLearner(storage, LOCAL_USER, clock.now());
    learner.preferences = {
      ...learner.preferences,
      language: Intl.getCanonicalLocales(language)[0]!,
      name: name.trim(),
    };
    learner.updatedAt = clock.now().toISOString();
    await storage.saveLearnerModel(learner);

    return [{ type: "ok", message: "profile saved" }];
  }

  /**
   * Checks the key with the provider before saving it, keeping the model
   * already chosen for that provider. The check runs outside the queue, so a
   * slow provider never holds up turns
   */
  private async setKey(provider: ProviderId, apiKey: string): Promise<Reply[]> {
    const current = await this.credentials.active();
    const model =
      current?.provider === provider
        ? current.model
        : MODEL_CHOICES[provider][0]!.id;
    const credentials = { provider, apiKey, model };

    const refusal = await verifyCredentials(credentials);
    if (refusal !== null) return [{ type: "error", message: refusal }];

    return this.options.queue.run(async () => {
      await this.credentials.save(credentials);
      return this.switchTo(credentials);
    });
  }

  /** Puts a provider in front of every tutor at once. Null means no key is saved for the choice */
  private switchTo(credentials: Credentials | null): Reply[] {
    if (credentials === null) {
      return [{ type: "error", message: "no key is saved for that provider" }];
    }
    this.provider.use(createProvider(credentials));
    return [
      {
        type: "ok",
        message: `using ${credentials.provider} · ${credentials.model}`,
      },
    ];
  }
}
