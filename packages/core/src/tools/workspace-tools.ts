import { posix } from "node:path";
import { z } from "zod";

import type { FileContent } from "../ports/workspace";
import { isGenerated } from "../repo/ignore";
import type { ToolContext } from "./context";
import { completeItem, findOpenItem } from "./items";
import { defineTool, type Tool } from "./registry";

const LIST_LIMIT = 80;
const MAX_CONTEXT_FILES = 3;
const PAGE_CHARS = 12_000;

export const listFiles: Tool<ToolContext> = defineTool({
  name: "list_files",
  description:
    "List files in the repository. Dependency and build directories are excluded.",
  args: z.object({
    subpath: z.string().optional().describe("Repo-relative directory to list."),
  }),

  async execute(args, context: ToolContext) {
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
});

export const readFile: Tool<ToolContext> = defineTool({
  name: "read_file",
  description:
    "Read a file from the repository, one page at a time. A page that does not reach the end says where to continue.",
  args: z.object({
    path: z.string().min(1).describe("Repo-relative path."),
    startLine: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("1-based line to start from, as given by the previous page."),
  }),

  async execute(args, context: ToolContext) {
    if (isGenerated(posix.basename(args.path.replaceAll("\\", "/")))) {
      return {
        content: `${args.path} is machine-written (a lockfile, minified or generated code). Read the manifest or the source it comes from instead.`,
        isError: true,
      };
    }

    const file = await context.workspace.readFile(args.path);

    const pinned = context.session.contextFiles.filter(
      (path) => path !== file.path,
    );
    pinned.push(file.path);
    context.session.contextFiles = pinned.slice(-MAX_CONTEXT_FILES);

    return { content: renderPage(file, args.startLine ?? 1) };
  },
});

/**
 * One page of a file, cut at a line boundary, with the line to resume from.
 * A single line longer than a page is cut and marked
 */
export function renderPage(file: FileContent, startLine: number): string {
  const lines = file.text.split("\n");
  if (startLine > lines.length) {
    return `${file.path} has ${lines.length} lines; nothing at line ${startLine}.`;
  }

  const page: string[] = [];
  let chars = 0;
  let next = startLine - 1;

  while (next < lines.length) {
    const line = lines[next]!;
    if (page.length > 0 && chars + line.length + 1 > PAGE_CHARS) break;
    page.push(
      line.length > PAGE_CHARS
        ? `${line.slice(0, PAGE_CHARS)} [line cut]`
        : line,
    );
    chars += line.length + 1;
    next += 1;
  }

  const header = `${file.path}${file.dirty ? " (unsaved)" : ""} · lines ${startLine}-${next} of ${lines.length}`;
  const footer =
    next < lines.length
      ? `\n[continues: read_file with startLine ${next + 1}]`
      : "";
  return `${header}\n\n${page.join("\n")}${footer}`;
}

/** The model's verdict on an attempt. Exercises with a check are decided only by verify */
export const recordAttempt: Tool<ToolContext> = defineTool({
  name: "record_attempt",
  description:
    "Record how the user's own attempt at an exercise without a check turned out. Never use it for environment or setup problems such as a missing compiler, an installation error or a wrong PATH.",
  args: z.object({
    itemId: z.string().min(1).describe("The exercise."),
    outcome: z
      .enum(["pass", "fail", "partial"])
      .describe("How the attempt turned out."),
    filePath: z
      .string()
      .min(1)
      .optional()
      .describe("Repo-relative file containing the attempt."),
    note: z
      .string()
      .optional()
      .describe("What decided the outcome, in one line."),
  }),

  async execute(args, context: ToolContext) {
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
});
