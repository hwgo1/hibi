import { describe, expect, test } from "bun:test";

import { disputeWeight, scoreResponse } from "../src/quiz/scoring";

describe("scoreResponse", () => {
  test("a correct answer is graded observation, discounted by the guess rate", () => {
    const four = scoreResponse("correct", 4);
    const three = scoreResponse("correct", 3);

    expect(four.provenance).toBe("graded_choice");
    expect(four.outcome).toBe("pass");
    expect(four.confidence).toBeCloseTo(0.75, 5);
    expect(three.confidence).toBeLessThan(four.confidence);
  });

  test("a wrong answer carries full confidence", () => {
    const scored = scoreResponse("incorrect", 4);

    expect(scored.outcome).toBe("fail");
    expect(scored.confidence).toBe(1);
  });

  test("an admitted gap is recorded without being scored as failure", () => {
    const scored = scoreResponse("unknown", 4);

    expect(scored.outcome).toBe("n/a");
    expect(scored.provenance).toBe("self_declared");
  });
});

describe("disputeWeight", () => {
  test("the first dispute counts fully", () => {
    expect(disputeWeight(0)).toBe(1);
  });

  test("repeats count for less without reaching zero", () => {
    expect(disputeWeight(1)).toBeLessThan(disputeWeight(0));
    expect(disputeWeight(5)).toBeGreaterThan(0);
  });
});
