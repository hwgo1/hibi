import { z } from "zod";

import type { ToolContext } from "./context";
import type { Tool } from "./registry";

const LIST_LIMIT = 80;

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
      .map((e) => `${e.path} (${e.bytes}b)`)
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
    if (!context.session.contextFiles.includes(file.path)) {
      context.session.contextFiles.push(file.path);
    }
    return {
      content: `${file.path}${file.dirty ? " (unsaved)" : ""}\n\n${file.text}`,
    };
  },
};

const RecordArgs = z.object({
  intentId: z.string().min(1),
  outcome: z.enum(["pass", "fail", "partial"]),
  note: z.string().optional(),
});

/**
 * Records the result of an attempt. Credit is discounted by the hint depth reached, so solving
 * after being shown the correction is worth less than solving unaided
 */
export const recordAttempt: Tool<ToolContext> = {
  definition: {
    name: "record_attempt",
    description: "Record how the user's attempt turned out.",
    parameters: {
      type: "object",
      properties: {
        intentId: { type: "string" },
        outcome: { type: "string", enum: ["pass", "fail", "partial"] },
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
      confidence: 0.8,
      outcome: args.outcome,
      helpDepth:
        resolveIntent?.kind === "resolve" ? resolveIntent.step : undefined,
      note: args.note,
    });

    return { content: `Recorded: ${args.outcome}.` };
  },
};
