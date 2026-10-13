import { z } from "zod";

import type { ToolDefinition } from "../ports/llm";

export interface Tool<C> {
  definition: ToolDefinition;
  execute(args: unknown, context: C): Promise<ToolOutcome>;
}

export interface ToolOutcome {
  content: string;
  isError?: boolean;
}

export interface ToolSpec<C, S extends z.ZodObject> {
  name: string;
  description: string;
  args: S;
  execute(args: z.output<S>, context: C): Promise<ToolOutcome>;
}

/** The zod schema is the only source: the model sees its JSON Schema, and calls are parsed against it once */
export function defineTool<C, S extends z.ZodObject>(
  spec: ToolSpec<C, S>,
): Tool<C> {
  return {
    definition: {
      name: spec.name,
      description: spec.description,
      parameters: toParameters(spec.args),
    },
    async execute(rawArgs, context) {
      const parsed = spec.args.safeParse(rawArgs ?? {});
      if (!parsed.success) {
        return {
          content: `invalid arguments: ${z.prettifyError(parsed.error)}`,
          isError: true,
        };
      }
      return spec.execute(parsed.data, context);
    },
  };
}

export function toParameters(schema: z.ZodObject): Record<string, unknown> {
  const { $schema: _, ...parameters } = z.toJSONSchema(schema, {
    io: "input",
  });
  return parameters;
}

export class ToolRegistry<C> {
  private readonly tools = new Map<string, Tool<C>>();

  register(tool: Tool<C>): this {
    this.tools.set(tool.definition.name, tool);
    return this;
  }

  definitions(): ToolDefinition[] {
    return [...this.tools.values()].map((tool) => tool.definition);
  }

  /**
   * Unknown names and thrown errors come back as error results, so a malformed
   * call costs a turn instead of killing the daemon mid-session
   */
  async execute(name: string, args: unknown, context: C): Promise<ToolOutcome> {
    const tool = this.tools.get(name);
    if (tool === undefined) {
      return { content: `unknown tool: ${name}`, isError: true };
    }

    try {
      return await tool.execute(args, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: message, isError: true };
    }
  }
}
