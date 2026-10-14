import type { Concept, ConceptId, ConceptRegistry } from "../concepts";
import { seedRegistry } from "../concepts";
import { lookupConcept } from "../concept-resolver";
import type { SessionId, UserId } from "../ids";
import type {
  LLMProvider,
  ProviderMessage,
  TokenUsage,
  ToolCall,
  ToolResult,
} from "../ports/llm";
import type { Clock, Storage } from "../ports/storage";
import type { Workspace } from "../ports/workspace";
import {
  buildEvidence,
  buildRetraction,
  type EvidenceEvent,
  type EvidenceOrigin,
} from "../schemas/evidence";
import type { Goal } from "../schemas/goal";
import {
  SESSION_STATE_SCHEMA_VERSION,
  type SessionState,
} from "../schemas/session";
import type { ToolContext } from "../tools";
import { buildToolRegistry } from "../tools";
import type { ToolRegistry } from "../tools/registry";
import { loadLearner, refreshLearner } from "./learner-model";
import { buildSystemPrompt } from "./prompt";

const MAX_TOOL_ROUNDS = 5;
const MAX_TOKENS = 4096;
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 500;

/** Messages sent to the model each turn */
const TRANSCRIPT_WINDOW = 6;
/** Messages kept in memory; durable state lives in the session file */
const TRANSCRIPT_CAP = 24;
const UNDO_DEPTH = 20;

export type TurnEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; args: unknown }
  | { type: "usage"; usage: TokenUsage; model: string }
  | { type: "error"; message: string };

export interface CommandOutcome {
  ok: boolean;
  message: string;
}

export interface TutorSessionDeps {
  provider: LLMProvider;
  storage: Storage;
  workspace: Workspace;
  clock: Clock;
}

interface CompletionOutcome {
  text: string;
  toolCalls: ToolCall[];
  stopReason: "end_turn" | "tool_use" | "max_tokens";
  error: string | null;
  usage: TokenUsage | null;
}

/** What a committed turn changed, enough to put everything back */
interface TurnRecord {
  session: SessionState;
  goal: Goal | null;
  createdConcepts: ConceptId[];
  changedConcepts: Concept[];
  transcriptLength: number;
  evidence: Array<Pick<EvidenceEvent, "id" | "conceptId">>;
}

/**
 * Owns one repository's conversation: the session, the transcript and the turns
 * that can still be undone. Every change to them goes through here.
 */
export class TutorSession {
  private readonly tools: ToolRegistry<ToolContext> = buildToolRegistry();
  private current: SessionState;
  private transcript: ProviderMessage[] = [];
  private readonly history: TurnRecord[] = [];

  constructor(
    private readonly deps: TutorSessionDeps,
    session: SessionState,
  ) {
    this.current = session;
  }

  get session(): Readonly<SessionState> {
    return this.current;
  }

  /**
   * Runs one turn on copies of the session, learner and registry and commits them
   * only if the turn completes, so a failure midway leaves no trace
   */
  async *turn(userMessage: string): AsyncGenerator<TurnEvent> {
    const { storage, workspace, clock, provider } = this.deps;
    const now = clock.now();
    const userId = this.current.userId;

    const [learner, registry, repo] = await Promise.all([
      loadLearner(storage, userId, now),
      this.loadRegistry(userId, now),
      storage.loadRepoModel(this.current.repoRoot),
    ]);
    const goalBefore = structuredClone(learner.goal);
    const registryBefore = structuredClone(registry);

    const context: ToolContext = {
      session: structuredClone(this.current),
      learner,
      registry,
      workspace,
      storage,
      clock,
      pendingEvidence: [],
    };

    const system = await buildSystemPrompt({
      learner,
      session: context.session,
      registry,
      repo,
      workspace,
      now,
    });

    const messages: ProviderMessage[] = [
      ...this.transcript.slice(-TRANSCRIPT_WINDOW),
      { role: "user", content: userMessage },
    ];

    let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    let reply = "";

    for (let round = 0; ; round++) {
      const last = round === MAX_TOOL_ROUNDS;
      const result = yield* this.complete(system, messages, last);
      usage = addUsage(usage, result.usage);

      if (result.error !== null) {
        yield { type: "usage", usage, model: provider.model };
        yield { type: "error", message: result.error };
        return;
      }

      reply += result.text;
      if (last || result.toolCalls.length === 0) break;

      messages.push({
        role: "assistant",
        content: result.text,
        toolCalls: result.toolCalls,
      });

      const results: ToolResult[] = [];
      for (const call of result.toolCalls) {
        yield { type: "tool", name: call.name, args: call.arguments };
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

    yield { type: "usage", usage, model: provider.model };

    const evidence = await this.commit(context, now);
    this.remember({
      session: this.current,
      goal: goalBefore,
      ...registryChanges(registryBefore, context.registry),
      transcriptLength: this.transcript.length,
      evidence,
    });

    this.current = context.session;
    this.transcript = [
      ...this.transcript,
      { role: "user" as const, content: userMessage },
      { role: "assistant" as const, content: reply },
    ].slice(-TRANSCRIPT_CAP);
  }

  /** Puts back the session, goal and concepts as they were before the last turn and retracts its evidence */
  async undo(): Promise<CommandOutcome> {
    const record = this.history.pop();
    if (record === undefined) return { ok: false, message: "nothing to undo" };

    const { storage, clock } = this.deps;
    const now = clock.now();
    const userId = record.session.userId;

    if (record.evidence.length > 0) {
      await storage.appendEvidence([
        buildRetraction(
          record.evidence,
          this.origin(record.session.turnCount + 1, now),
        ),
      ]);
    }

    const [learner, registry] = await Promise.all([
      loadLearner(storage, userId, now),
      this.loadRegistry(userId, now),
    ]);
    const restored = restoreRegistry(registry, record, now);
    learner.goal = record.goal;
    await refreshLearner(storage, learner, restored, now);

    await Promise.all([
      storage.saveSession(record.session),
      storage.saveConceptRegistry(userId, restored),
      storage.saveLearnerModel(learner),
    ]);

    this.current = record.session;
    this.transcript = this.transcript.slice(0, record.transcriptLength);
    return {
      ok: true,
      message: `turn ${record.session.turnCount + 1} undone`,
    };
  }

  /** Retracts every event recorded on one concept, leaving other concepts from the same turns intact */
  async forget(term: string): Promise<CommandOutcome> {
    const { storage, clock } = this.deps;
    const now = clock.now();
    const userId = this.current.userId;
    const registry = await this.loadRegistry(userId, now);

    const lookup = lookupConcept(registry, term);
    if (lookup.status === "unknown") {
      return { ok: false, message: `no concept matches "${term}"` };
    }
    if (lookup.status === "ambiguous") {
      const ids = lookup.candidates.map((concept) => concept.id).join(", ");
      return {
        ok: false,
        message: `"${term}" could be: ${ids}. Name one of them.`,
      };
    }

    const conceptId = lookup.concept.id;
    const events = await storage.queryEvidence({ userId, conceptId });
    if (events.length === 0) {
      return { ok: true, message: `nothing recorded on ${conceptId}` };
    }

    await storage.appendEvidence([
      buildRetraction(events, this.origin(this.current.turnCount, now)),
    ]);
    await this.saveRefreshedLearner(registry, now);
    return {
      ok: true,
      message: `forgot ${events.length} events on ${conceptId}`,
    };
  }

  /** Deletes the whole log. Turns before this can no longer be undone */
  async forgetAll(): Promise<CommandOutcome> {
    const { storage, clock } = this.deps;
    const now = clock.now();
    const removed = await storage.clearEvidence();
    this.history.length = 0;
    await this.saveRefreshedLearner(
      await this.loadRegistry(this.current.userId, now),
      now,
    );
    return { ok: true, message: `removed ${removed} events permanently` };
  }

  clearTranscript(): void {
    this.transcript = [];
  }

  private async *complete(
    system: string,
    messages: ProviderMessage[],
    last: boolean,
  ): AsyncGenerator<TurnEvent, CompletionOutcome> {
    const { provider } = this.deps;

    for (let attempt = 0; ; attempt++) {
      let text = "";
      const toolCalls: ToolCall[] = [];
      let stopReason: CompletionOutcome["stopReason"] = "end_turn";
      let error: string | null = null;
      let retryable = false;
      let usage: TokenUsage | null = null;

      for await (const event of provider.complete({
        system,
        messages,
        tools: this.tools.definitions(),
        toolChoice: last ? "none" : "auto",
        maxTokens: MAX_TOKENS,
      })) {
        if (event.type === "text_delta") {
          text += event.text;
          yield { type: "text", text: event.text };
        } else if (event.type === "tool_call") {
          toolCalls.push(event.call);
        } else if (event.type === "usage") {
          usage = event.usage;
        } else if (event.type === "done") {
          stopReason = event.stopReason;
        } else {
          error = event.message;
          retryable = event.retryable;
        }
      }

      const nothingShown = text.length === 0 && toolCalls.length === 0;
      if (
        error !== null &&
        retryable &&
        nothingShown &&
        attempt < MAX_RETRIES
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_BASE_MS * 2 ** attempt),
        );
        continue;
      }

      return {
        text,
        toolCalls: last ? [] : toolCalls,
        stopReason,
        error,
        usage,
      };
    }
  }

  /** Writes the turn's evidence in one append, then the state it produced */
  private async commit(
    context: ToolContext,
    now: Date,
  ): Promise<TurnRecord["evidence"]> {
    const { storage } = this.deps;
    const session = context.session;
    session.turnCount += 1;
    session.updatedAt = now.toISOString();

    const origin = this.origin(session.turnCount, now);
    const events = context.pendingEvidence.map((pending) =>
      buildEvidence(pending, origin),
    );
    await storage.appendEvidence(events);

    if (events.length > 0) {
      await refreshLearner(storage, context.learner, context.registry, now);
    }

    await Promise.all([
      storage.saveSession(session),
      storage.saveConceptRegistry(session.userId, context.registry),
      storage.saveLearnerModel(context.learner),
    ]);

    return events.map(({ id, conceptId }) => ({ id, conceptId }));
  }

  private remember(record: TurnRecord): void {
    this.history.push(record);
    if (this.history.length > UNDO_DEPTH) this.history.shift();
  }

  private async saveRefreshedLearner(
    registry: ConceptRegistry,
    now: Date,
  ): Promise<void> {
    const { storage } = this.deps;
    const learner = await loadLearner(storage, this.current.userId, now);
    await refreshLearner(storage, learner, registry, now);
    await storage.saveLearnerModel(learner);
  }

  private origin(turnIndex: number, now: Date): EvidenceOrigin {
    return {
      userId: this.current.userId,
      sessionId: this.current.sessionId,
      turnIndex,
      at: now.toISOString(),
    };
  }

  private async loadRegistry(
    userId: UserId,
    now: Date,
  ): Promise<ConceptRegistry> {
    const existing = await this.deps.storage.loadConceptRegistry(userId);
    return existing ?? seedRegistry(now);
  }
}

function addUsage(total: TokenUsage, next: TokenUsage | null): TokenUsage {
  if (next === null) return total;
  return {
    inputTokens: total.inputTokens + next.inputTokens,
    cachedInputTokens:
      (total.cachedInputTokens ?? 0) + (next.cachedInputTokens ?? 0),
    outputTokens: total.outputTokens + next.outputTokens,
  };
}

function registryChanges(
  before: ConceptRegistry,
  after: ConceptRegistry,
): Pick<TurnRecord, "createdConcepts" | "changedConcepts"> {
  const previous = new Map(before.concepts.map((c) => [c.id, c]));
  const createdConcepts: ConceptId[] = [];
  const changedConcepts: Concept[] = [];

  for (const concept of after.concepts) {
    const old = previous.get(concept.id);
    if (old === undefined) createdConcepts.push(concept.id);
    else if (JSON.stringify(old) !== JSON.stringify(concept)) {
      changedConcepts.push(old);
    }
  }
  return { createdConcepts, changedConcepts };
}

/**
 * Reverts only what the turn changed. The registry is shared with other
 * repositories, so concepts they added since are kept
 */
function restoreRegistry(
  registry: ConceptRegistry,
  record: TurnRecord,
  now: Date,
): ConceptRegistry {
  const created = new Set<string>(record.createdConcepts);
  const changed = new Map(record.changedConcepts.map((c) => [c.id, c]));
  return {
    ...registry,
    updatedAt: now.toISOString(),
    concepts: registry.concepts
      .filter((concept) => !created.has(concept.id))
      .map((concept) => changed.get(concept.id) ?? concept),
  };
}

export function newSessionState(
  sessionId: SessionId,
  userId: UserId,
  repoRoot: string,
  now: Date,
): SessionState {
  const at = now.toISOString();
  return {
    schemaVersion: SESSION_STATE_SCHEMA_VERSION,
    sessionId,
    userId,
    repoRoot,
    createdAt: at,
    updatedAt: at,
    items: [],
    activeItemId: null,
    findings: [],
    contextFiles: [],
    openQuiz: null,
    dispute: null,
    openElicitation: null,
    lastElicitedTurn: null,
    elicitationsAsked: 0,
    consecutiveIgnored: 0,
    turnCount: 0,
  };
}
