import { z } from "zod";

import type { Intent } from "../schemas/session";
import type { ToolContext } from "./context";
import type { Tool } from "./registry";

const LIST_LIMIT = 80;
const MAX_CONTEXT_FILES = 3;

const ListArgs = z.object({ subpath: z.string().optional() });

export const listFiles: Tool<ToolContext> = {
  definition: {
    name: "list_files",
    description:
      "List files in the repository. Dependency and build directories are excluded.",
    parameters: {
      type: "object",
      properties: { subpath: { type: "string" } },
      required: [],
    },
  },

  async execute(rawArgs, context) {
    const args = ListArgs.parse(rawArgs);
    const result = await context.workspace.listFiles({
      subpath: args.subpath,
      limit: LIST_LIMIT,
    });
    const lines = result.entries
      .map((entry) => `${entry.path} (${entry.bytes}b)`)
      .join("\n");
    return {
      content: result.truncated
        ? `${lines}\n[truncated at ${LIST_LIMIT}]`
        : lines,
    };
  },
};

const ReadArgs = z.object({ path: z.string().min(1) });

export const readFile: Tool<ToolContext> = {
  definition: {
    name: "read_file",
    description: "Read a file from the repository.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },

  async execute(rawArgs, context) {
    const args = ReadArgs.parse(rawArgs);
    const file = await context.workspace.readFile(args.path);

    const pinned = context.session.contextFiles.filter(
      (path) => path !== file.path,
    );
    pinned.push(file.path);
    context.session.contextFiles = pinned.slice(-MAX_CONTEXT_FILES);

    return {
      content: `${file.path}${file.dirty ? " (unsaved)" : ""}\n\n${file.text}`,
    };
  },
};

const RecordArgs = z.object({
  intentId: z.string().min(1),
  outcome: z.enum(["pass", "fail", "partial"]),
  filePath: z.string().min(1).optional(),
  note: z.string().optional(),
});

function attemptFile(
  intent: Intent,
  explicit: string | undefined,
): string | undefined {
  if (explicit !== undefined) return explicit;
  return intent.kind === "exercise" ? intent.targetFile : undefined;
}

export const recordAttempt: Tool<ToolContext> = {
  definition: {
    name: "record_attempt",
    description:
      "Record how the user's own attempt at an exercise turned out. Never use it for environment or setup problems such as a missing compiler, an installation error or a wrong PATH.",
    parameters: {
      type: "object",
      properties: {
        intentId: { type: "string" },
        outcome: { type: "string", enum: ["pass", "fail", "partial"] },
        filePath: {
          type: "string",
          description: "Repo-relative file containing the attempt.",
        },
        note: { type: "string" },
      },
      required: ["intentId", "outcome"],
    },
  },

  async execute(rawArgs, context) {
    const args = RecordArgs.parse(rawArgs);
    const intent = context.session.intents.find((i) => i.id === args.intentId);
    if (intent === undefined) {
      return { content: `unknown intent: ${args.intentId}`, isError: true };
    }

    const at = context.clock.now().toISOString();
    intent.lastTouchedAt = at;
    if (args.outcome === "pass") intent.status = "done";

    const resolveIntent = context.session.intents.find(
      (i) =>
        i.kind === "resolve" &&
        i.status === "active" &&
        i.target.type === "exercise" &&
        i.target.intentId === args.intentId,
    );

    if (resolveIntent?.kind === "resolve") {
      resolveIntent.attempts += 1;
      resolveIntent.lastTouchedAt = at;
      if (args.outcome === "pass") resolveIntent.status = "done";
    }

    context.pendingEvidence.push({
      kind: "attempt_submitted",
      conceptId: intent.conceptId,
      provenance: "model_judged",
      outcome: args.outcome,
      helpDepth:
        resolveIntent?.kind === "resolve" ? resolveIntent.step : undefined,
      filePath: attemptFile(intent, args.filePath),
      note: args.note,
    });

    return { content: `Recorded: ${args.outcome}.` };
  },
};
