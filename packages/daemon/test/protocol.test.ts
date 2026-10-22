import { describe, expect, test } from "bun:test";

import { ClientRequestSchema, decodeLines, encode } from "../src/protocol";

describe("protocol", () => {
  test("splits whole messages and keeps the partial tail", () => {
    const buffer = `${encode({ id: "r1", type: "state" })}{"type":"mess`;
    const { messages, rest } = decodeLines(buffer);

    expect(messages).toEqual([{ id: "r1", type: "state" }]);
    expect(rest).toBe(`{"type":"mess`);
  });

  test("a line that is not JSON decodes to null instead of throwing", () => {
    const { messages } = decodeLines(`not json\n${encode({ id: "r2", type: "undo" })}`);
    expect(messages).toEqual([null, { id: "r2", type: "undo" }]);
  });

  test("rejects a request without an id", () => {
    expect(ClientRequestSchema.safeParse({ type: "state" }).success).toBe(false);
  });

  test("rejects an unknown request type", () => {
    expect(
      ClientRequestSchema.safeParse({ id: "r1", type: "nope" }).success,
    ).toBe(false);
  });

  test("rejects an empty message", () => {
    expect(
      ClientRequestSchema.safeParse({ id: "r1", type: "message", text: "" })
        .success,
    ).toBe(false);
  });

  test("accepts a preference update", () => {
    const parsed = ClientRequestSchema.safeParse({
      id: "r1",
      type: "set_preference",
      key: "theoryDepth",
      value: "thorough",
    });
    expect(parsed.success).toBe(true);
  });
});
