import { describe, expect, test } from "bun:test";

import { Typewriter } from "../src/typewriter";

describe("Typewriter", () => {
  test("drains a burst in order and in full", async () => {
    let output = "";
    const typewriter = new Typewriter((text) => (output += text), 2, 1);

    typewriter.push("abcdefg");
    await typewriter.drain();

    expect(output).toBe("abcdefg");
  });

  test("flush emits the remainder immediately", () => {
    let output = "";
    const typewriter = new Typewriter((text) => (output += text), 1, 1000);

    typewriter.push("hello");
    typewriter.flush();

    expect(output).toBe("hello");
  });
});
