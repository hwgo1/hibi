import type {
  CompletionEvent,
  CompletionRequest,
  LLMProvider,
  ProviderCapabilities,
} from "../ports/llm";

export class FakeProvider implements LLMProvider {
  readonly id = "fake";
  readonly model = "fake-model";
  readonly capabilities: ProviderCapabilities = {
    supportsTools: true,
    meetsTutorBaseline: true,
  };

  readonly requests: CompletionRequest[] = [];
  private index = 0;

  constructor(private readonly script: CompletionEvent[][]) {}

  async *complete(request: CompletionRequest): AsyncIterable<CompletionEvent> {
    this.requests.push(request);
    const events = this.script[this.index] ?? [
      { type: "done", stopReason: "end_turn" as const },
    ];
    this.index += 1;
    for (const event of events) {
      yield event;
    }
  }
}
