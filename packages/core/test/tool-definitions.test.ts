import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { buildToolRegistry, defineTool } from "../src/tools";
import { testContext } from "./fixtures";

interface ObjectSchema {
  type: string;
  properties: Record<string, { description?: string }>;
  required?: string[];
}

const definitions = buildToolRegistry().definitions();

describe("tool definitions", () => {
  test("are plain JSON Schema objects without a $schema key", () => {
    for (const definition of definitions) {
      expect(definition.parameters).not.toHaveProperty("$schema");
      expect(definition.parameters["type"]).toBe("object");
    }
  });

  test("describe every argument the model sees", () => {
    for (const definition of definitions) {
      const schema = definition.parameters as unknown as ObjectSchema;
      for (const [name, property] of Object.entries(schema.properties)) {
        expect(
          property.description,
          `${definition.name}.${name}`,
        ).toBeDefined();
      }
    }
  });

  test("optional arguments are not required", () => {
    const explain = definitions.find(
      (definition) => definition.name === "explain_concept",
    )!.parameters as unknown as ObjectSchema;

    expect(explain.required).toEqual(["conceptTerm"]);
  });

  test("explain_concept runs without a parent term", async () => {
    const result = await buildToolRegistry().execute(
      "explain_concept",
      { conceptTerm: "concurrency" },
      testContext(),
    );

    expect(result.isError).toBeUndefined();
  });
});

describe("defineTool", () => {
  const echo = defineTool({
    name: "echo",
    description: "Echo a word.",
    args: z.object({ word: z.string().min(1).describe("The word.") }),
    async execute(args) {
      return { content: args.word };
    },
  });

  test("hands the tool parsed arguments", async () => {
    expect(await echo.execute({ word: "oi" }, {})).toEqual({ content: "oi" });
  });

  test("returns invalid arguments as an error naming the field", async () => {
    const result = await echo.execute({ word: 3 }, {});

    expect(result.isError).toBe(true);
    expect(result.content).toContain("word");
  });

  test("treats missing arguments as an empty object", async () => {
    const result = await echo.execute(undefined, {});

    expect(result.isError).toBe(true);
    expect(result.content).toContain("word");
  });
});
