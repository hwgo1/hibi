import { z } from "zod";

import type { SessionState, WorkItem } from "../schemas/session";
import type { ToolContext } from "./context";
import type { Tool } from "./registry";

export type ItemLookup =
  | { found: true; item: WorkItem }
  | { found: false; reason: string };

/** Defaults to the active item. Closed items are refused so they never collect evidence twice */
export function findOpenItem(
  session: SessionState,
  itemId?: string,
): ItemLookup {
  const id = itemId ?? session.activeItemId;
  if (id === null) return { found: false, reason: "no exercise is open" };

  const item = session.items.find((candidate) => candidate.id === id);
  if (item === undefined)
    return { found: false, reason: `unknown item: ${id}` };
  if (item.status !== "active") {
    return {
      found: false,
      reason: `${item.id} is ${item.status}; propose a new exercise to keep practicing`,
    };
  }
  return { found: true, item };
}

/** Marks the item done and settles an open dispute on its concept */
export function completeItem(session: SessionState, item: WorkItem): void {
  item.status = "done";
  if (session.dispute?.conceptId === item.conceptId) session.dispute = null;
}

const AbandonArgs = z.object({
  itemId: z.string().min(1),
  reason: z.string().min(1).optional(),
});

export const abandonItem: Tool<ToolContext> = {
  definition: {
    name: "abandon_item",
    description:
      "Close an exercise the user decided to drop. Use only when they say so, never to clear the list.",
    parameters: {
      type: "object",
      properties: {
        itemId: { type: "string", description: "The exercise being dropped." },
        reason: {
          type: "string",
          description: "Why, in a few words, when the user said.",
        },
      },
      required: ["itemId"],
    },
  },

  async execute(rawArgs, context) {
    const args = AbandonArgs.parse(rawArgs);
    const lookup = findOpenItem(context.session, args.itemId);
    if (!lookup.found) return { content: lookup.reason, isError: true };

    const { item } = lookup;
    item.status = "abandoned";
    item.lastTouchedAt = context.clock.now().toISOString();
    if (context.session.activeItemId === item.id) {
      context.session.activeItemId = null;
    }

    context.pendingEvidence.push({
      kind: "item_abandoned",
      conceptId: item.conceptId,
      provenance: "system",
      note: args.reason,
    });

    return { content: `${item.id} closed as abandoned.` };
  },
};
