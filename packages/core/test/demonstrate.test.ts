import { describe, expect, test } from "bun:test";

import { buildToolRegistry } from "../src/tools";
import { testContext } from "./fixtures";

describe("demonstrate_code", () => {
  test("records what was shown as a system event, not mastery", async () => {
    const ctx = testContext();
    const result = await buildToolRegistry().execute(
      "demonstrate_code",
      { conceptTerm: "tooling", subject: "a GitHub Actions workflow" },
      ctx,
    );

    expect(result.isError).toBeUndefined();
    expect(ctx.session.intents[0]?.kind).toBe("demonstrate");
    expect(ctx.pendingEvidence[0]?.kind).toBe("code_demonstrated");
    expect(ctx.pendingEvidence[0]?.provenance).toBe("system");
  });

  test("refuses while an exercise on the same concept is open", async () => {
    const ctx = testContext();
    const registry = buildToolRegistry();

    await registry.execute(
      "propose_exercise",
      { conceptTerm: "concurrency", statement: "build a worker pool" },
      ctx,
    );
    const result = await registry.execute(
      "demonstrate_code",
      { conceptTerm: "concurrency", subject: "a worker pool" },
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(
      ctx.session.intents.some((intent) => intent.kind === "demonstrate"),
    ).toBe(false);
  });
});
