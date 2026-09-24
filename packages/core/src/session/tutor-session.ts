import type { ConceptRegistry } from "../concepts";
import { seedRegistry } from "../concepts";
import type { EvidenceId, SessionId, UserId } from "../ids";
import type {
  LLMProvider,
  ProviderMessage,
  TokenUsage,
  ToolCall,
  ToolResult,
} from "../ports/llm";
import type { Clock, Storage } from "../ports/storage";
import type { Workspace } from "../ports/workspace";
import { computeMastery } from "../policy/mastery";
import type { EvidenceEvent } from "../schemas/evidence";
import { EVIDENCE_EVENT_SCHEMA_VERSION } from "../schemas/evidence";
import type { LearnerModel } from "../schemas/learner";
import { DEFAULT_TEACHING_PREFERENCES } from "../schemas/learner";
import type { SessionState } from "../schemas/session";
import type { ToolContext } from "../tools";
import { buildToolRegistry } from "../tools";
import type { ToolRegistry } from "../tools/registry";
import { buildSystemPrompt } from "./prompt";

/** Bounds a single turn so a misbehaving model cannot loop indefinitely */
const MAX_TOOL_ROUNDS = 8;
const MAX_TOKENS = 4096;
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 500;

/** Transcript turns kept in the request. Older ones are dropped */
const TRANSCRIPT_WINDOW = 12;

export type TurnEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | { type: "usage"; usage: TokenUsage; model: string }
  | { type: "error"; message: string };

interface CompletionOutcome {
  textChunks: string[];
  toolCalls: ToolCall[];
  stopReason: "end_turn" | "tool_use" | "max_tokens";
  error: string | null;
  usage: TokenUsage | null;
}

export interface TutorSessionDeps {
  provider: LLMProvider;
  storage: Storage;
  workspace: Workspace;
  clock: Clock;
}

export class TutorSession {
  private readonly tools: ToolRegistry<ToolContext>;

  constructor(private readonly deps: TutorSessionDeps) {
    this.tools = buildToolRegistry();
  }

  /**
   * Runs one turn: loads state, builds the prompt, drives the tool loop, then
   * persists. Evidence is buffered and written only on success, so a turn that
   * fails midway leaves no record of work that did not happen.
   */
  async *turn(
    session: SessionState,
    transcript: ProviderMessage[],
    userMessage: string,
  ): AsyncIterable<TurnEvent> {
    const { storage, workspace, clock, provider } = this.deps;
    const now = clock.now();

    const learner = await this.loadLearner(session.userId, now);
    const registry = await this.loadRegistry(session.userId, now);
    const repo = await storage.loadRepoModel(session.repoRoot);

    const context: ToolContext = {
      session,
      learner,
      registry,
      workspace,
      storage,
      clock,
      pendingEvidence: [],
    };

    const system = await buildSystemPrompt({
      learner,
      session,
      registry,
      repo,
      workspace,
      now,
    });

    const messages: ProviderMessage[] = [
      ...transcript.slice(-TRANSCRIPT_WINDOW),
      { role: "user", content: userMessage },
    ];

    let turnUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const result = yield* this.runCompletion(provider, system, messages);

      if (result.usage !== null) {
        turnUsage = {
          inputTokens: turnUsage.inputTokens + result.usage.inputTokens,
          outputTokens: turnUsage.outputTokens + result.usage.outputTokens,
        };
      }

      if (result.error !== null) {
        yield { type: "error", message: result.error };
        return;
      }

      if (result.toolCalls.length === 0) break;

      messages.push({
        role: "assistant",
        content: result.textChunks.join(""),
        toolCalls: result.toolCalls,
      });

      const results: ToolResult[] = [];
      for (const call of result.toolCalls) {
        yield { type: "tool", name: call.name };
        const outcome = await this.tools.execute(
          call.name,
          call.arguments,
          context,
        );
        results.push({
          toolCallId: call.id,
          content: outcome.content,
          isError: outcome.isError,
        });
      }

      messages.push({ role: "tool", results });

      if (result.stopReason !== "tool_use") break;
    }

    yield { type: "usage", usage: turnUsage, model: provider.model };
    await this.persist(context, now);
  }

  private async *runCompletion(
    provider: LLMProvider,
    system: string,
    messages: ProviderMessage[],
  ): AsyncGenerator<TurnEvent, CompletionOutcome> {
    for (let attempt = 0; ; attempt++) {
      const textChunks: string[] = [];
      const toolCalls: ToolCall[] = [];
      let stopReason: "end_turn" | "tool_use" | "max_tokens" = "end_turn";
      let error: string | null = null;
      let retryable = false;
      let usage: TokenUsage | null = null;

      for await (const event of provider.complete({
        system,
        messages,
        tools: this.tools.definitions(),
        maxTokens: MAX_TOKENS,
      })) {
        if (event.type === "text_delta") {
          textChunks.push(event.text);
          yield { type: "text", text: event.text };
        } else if (event.type === "tool_call") {
          toolCalls.push(event.call);
        } else if (event.type === "usage") {
          usage = event.usage;
        } else if (event.type === "done") {
          stopReason = event.stopReason;
        } else if (event.type === "error") {
          error = event.message;
          retryable = event.retryable;
        }
      }

      if (error !== null && retryable && attempt < MAX_RETRIES) {
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_BASE_MS * 2 ** attempt),
        );
        continue;
      }

      return { textChunks, toolCalls, stopReason, error, usage };
    }
  }

  private async loadLearner(userId: UserId, now: Date): Promise<LearnerModel> {
    const existing = await this.deps.storage.loadLearnerModel(userId);
    if (existing !== null) return existing;

    const at = now.toISOString();
    return {
      schemaVersion: 1,
      userId,
      createdAt: at,
      updatedAt: at,
      preferences: DEFAULT_TEACHING_PREFERENCES,
      mastery: [],
      recurringErrors: [],
      inferredSignals: [],
    };
  }

  private async loadRegistry(
    userId: UserId,
    now: Date,
  ): Promise<ConceptRegistry> {
    const existing = await this.deps.storage.loadConceptRegistry(userId);
    return existing ?? seedRegistry(now);
  }

  private async persist(context: ToolContext, now: Date): Promise<void> {
    const { storage } = this.deps;
    const at = now.toISOString();

    context.session.turnCount += 1;
    context.session.updatedAt = at;

    for (const pending of context.pendingEvidence) {
      const event: EvidenceEvent = {
        schemaVersion: EVIDENCE_EVENT_SCHEMA_VERSION,
        id: `ev_${Math.random().toString(36).slice(2, 12)}` as EvidenceId,
        at,
        userId: context.session.userId,
        sessionId: context.session.sessionId,
        turnIndex: context.session.turnCount,
        kind: pending.kind,
        conceptId: pending.conceptId,
        provenance: pending.provenance,
        confidence: pending.confidence ?? 1,
        outcome: pending.outcome ?? "n/a",
        helpDepth: pending.helpDepth,
        selfConfidence: pending.selfConfidence,
        predicted: pending.predicted,
        filePath: pending.filePath,
        note: pending.note,
      };
      await storage.appendEvidence(event);
    }

    await storage.saveSession(context.session);
    await storage.saveConceptRegistry(context.session.userId, context.registry);

    const changesMastery = context.pendingEvidence.some(
      (event) =>
        event.kind === "attempt_submitted" ||
        event.kind === "test_run" ||
        event.kind === "self_assessment",
    );
    if (!changesMastery) return;

    const events = await storage.queryEvidence({
      userId: context.session.userId,
    });
    context.learner.mastery = computeMastery(context.registry, events, now);
    context.learner.updatedAt = at;
    await storage.saveLearnerModel(context.learner);
  }
}

export function newSessionState(
  sessionId: SessionId,
  userId: UserId,
  repoRoot: string,
  now: Date,
): SessionState {
  const at = now.toISOString();
  return {
    schemaVersion: 1,
    sessionId,
    userId,
    repoRoot,
    createdAt: at,
    updatedAt: at,
    intents: [],
    activeIntentId: null,
    findings: [],
    contextFiles: [],
    turnCount: 0,
  };
}
