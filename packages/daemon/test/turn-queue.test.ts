import { describe, expect, test } from "bun:test";

import { TurnQueue } from "../src/turn-queue";

describe("TurnQueue", () => {
  test("runs tasks one at a time in submission order", async () => {
    const queue = new TurnQueue();
    const order: number[] = [];

    const task = (n: number, ms: number) => () =>
      new Promise<void>((resolve) =>
        setTimeout(() => {
          order.push(n);
          resolve();
        }, ms),
      );

    await Promise.all([
      queue.run(task(1, 30)),
      queue.run(task(2, 10)),
      queue.run(task(3, 0)),
    ]);
    expect(order).toEqual([1, 2, 3]);
  });

  test("a failing task does not block the queue", async () => {
    const queue = new TurnQueue();
    await queue
      .run(() => Promise.reject(new Error("boom")))
      .catch(() => undefined);
    expect(await queue.run(() => Promise.resolve("ok"))).toBe("ok");
  });
});
