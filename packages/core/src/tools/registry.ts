import type { ToolDefinition } from "../ports/llm";

export interface Tool<C> {
  definition: ToolDefinition;
  execute(args: unknown, context: C): Promise<ToolOutcome>;
}

export interface ToolOutcome {
  content: string;
  isError?: boolean;
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
