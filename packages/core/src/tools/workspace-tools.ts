import { z } from "zod";

import type { ToolContext } from "./context";
import { completeItem, findOpenItem } from "./items";
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
  itemId: z.string().min(1),
  outcome: z.enum(["pass", "fail", "partial"]),
  filePath: z.string().min(1).optional(),
  note: z.string().optional(),
});

/** The model's verdict on an attempt. Exercises with a check are decided only by verify */
export const recordAttempt: Tool<ToolContext> = {
  definition: {
    name: "record_attempt",
    description:
      "Record how the user's own attempt at an exercise without a check turned out. Never use it for environment or setup problems such as a missing compiler, an installation error or a wrong PATH.",
    parameters: {
      type: "object",
      properties: {
        itemId: { type: "string", description: "The exercise." },
        outcome: { type: "string", enum: ["pass", "fail", "partial"] },
        filePath: {
          type: "string",
          description: "Repo-relative file containing the attempt.",
        },
        note: { type: "string" },
      },
      required: ["itemId", "outcome"],
    },
  },

  async execute(rawArgs, context) {
    const args = RecordArgs.parse(rawArgs);
    const lookup = findOpenItem(context.session, args.itemId);
    if (!lookup.found) return { content: lookup.reason, isError: true };

    const { item } = lookup;
    if (item.check !== undefined) {
      return {
        content:
          "This exercise has a check: run verify instead of judging the attempt.",
        isError: true,
      };
    }

    item.lastTouchedAt = context.clock.now().toISOString();
    item.attempts += 1;
    if (args.outcome === "pass") completeItem(context.session, item);

    context.pendingEvidence.push({
      kind: "attempt_submitted",
      conceptId: item.conceptId,
      provenance: "model_judged",
      outcome: args.outcome,
      helpDepth: item.ladder?.step,
      forced: item.ladder?.forced,
      filePath: args.filePath ?? item.targetFile,
      note: args.note,
    });

    return { content: `Recorded: ${args.outcome}.` };
  },
};
