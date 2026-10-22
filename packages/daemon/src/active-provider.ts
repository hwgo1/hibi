import type {
  CompletionEvent,
  CompletionRequest,
  LLMProvider,
  ProviderCapabilities,
} from "@hibi/core";

const UNCONFIGURED: LLMProvider = {
  id: "none",
  model: "none",
  capabilities: { supportsTools: true, meetsTutorBaseline: false },
  async *complete(): AsyncIterable<CompletionEvent> {
    yield {
      type: "error",
      message: "no model is set up yet: open hibi to add an API key",
      retryable: false,
    };
  },
};

/**
 * The provider every space's tutor talks to. Switching it takes effect on the
 * next request of every space, with no restart. Before a key is set up it
 * answers every request with an error that says so.
 */
export class ActiveProvider implements LLMProvider {
  private current: LLMProvider;

  constructor(initial: LLMProvider | null) {
    this.current = initial ?? UNCONFIGURED;
  }

  get configured(): boolean {
    return this.current !== UNCONFIGURED;
  }

  get id(): string {
    return this.current.id;
  }

  get model(): string {
    return this.current.model;
  }

  get capabilities(): ProviderCapabilities {
    return this.current.capabilities;
  }

  use(provider: LLMProvider | null): void {
    this.current = provider ?? UNCONFIGURED;
  }

  complete(request: CompletionRequest): AsyncIterable<CompletionEvent> {
    return this.current.complete(request);
  }
}
