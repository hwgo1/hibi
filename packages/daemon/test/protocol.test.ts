import { describe, expect, test } from "bun:test";

import { ClientRequestSchema, decodeLines, encode } from "../src/protocol";

describe("protocol", () => {
  test("splits whole messages and keeps the partial tail", () => {
    const buffer = `${encode({ type: "state" })}{"type":"mess`;
    const { messages, rest } = decodeLines<unknown>(buffer);

    expect(messages).toHaveLength(1);
    expect(rest).toBe(`{"type":"mess`);
  });

  test("rejects an unknown request type", () => {
    expect(ClientRequestSchema.safeParse({ type: "nope" }).success).toBe(false);
  });

  test("rejects an empty message", () => {
    expect(
      ClientRequestSchema.safeParse({ type: "message", text: "" }).success,
    ).toBe(false);
  });

  test("accepts a preference update", () => {
    const parsed = ClientRequestSchema.safeParse({
      type: "set_preference",
      key: "theoryDepth",
      value: "thorough",
    });
    expect(parsed.success).toBe(true);
  });
});
