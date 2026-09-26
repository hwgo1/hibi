import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readManifest, subprojectId } from "../src/repo/manifests";

async function withFile<T>(
  name: string,
  content: string,
  fn: (path: string, dir: string) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "hibi-manifest-"));
  try {
    const path = join(dir, name);
    await writeFile(path, content);
    return await fn(path, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("readManifest", () => {
  test("reads the Go version and requirements", async () => {
    const info = await withFile(
      "go.mod",
      "module example.com/app\n\ngo 1.22\n\nrequire (\n\tgithub.com/x/y v1.2.3\n)\n",
      readManifest,
    );

    expect(info?.languageVersion).toBe("1.22");
    expect(info?.dependencies).toContain("github.com/x/y");
    expect(info?.testCommand).toBe("go test ./...");
  });

  test("detects TypeScript from the dependency list", async () => {
    const info = await withFile(
      "package.json",
      JSON.stringify({
        devDependencies: { typescript: "^5" },
        scripts: { test: "bun test" },
      }),
      readManifest,
    );

    expect(info?.languages).toContain("TypeScript");
    expect(info?.testCommand).toBe("npm test");
  });

  test("falls back to JavaScript without a typescript dependency", async () => {
    const info = await withFile(
      "package.json",
      JSON.stringify({ dependencies: { express: "^4" } }),
      readManifest,
    );

    expect(info?.languages).toContain("JavaScript");
    expect(info?.testCommand).toBeUndefined();
  });

  test("reads the Rust edition and dependencies", async () => {
    const info = await withFile(
      "Cargo.toml",
      '[package]\nname = "app"\nedition = "2021"\n\n[dependencies]\nserde = "1.0"\ntokio = { version = "1" }\n',
      readManifest,
    );

    expect(info?.languageVersion).toBe("edition 2021");
    expect(info?.dependencies).toContain("serde");
  });

  test("reads the Python version requirement", async () => {
    const info = await withFile(
      "pyproject.toml",
      '[project]\nname = "app"\nrequires-python = ">=3.11"\ndependencies = ["httpx", "pydantic"]\n',
      readManifest,
    );

    expect(info?.languageVersion).toBe(">=3.11");
    expect(info?.dependencies).toContain("httpx");
  });

  test("returns null for a malformed manifest instead of throwing", async () => {
    expect(
      await withFile("package.json", "{ not json", readManifest),
    ).toBeNull();
  });

  test("returns null for a file it does not parse", async () => {
    expect(
      await withFile("Gemfile", "source 'https://rubygems.org'", readManifest),
    ).toBeNull();
  });
});

describe("subprojectId", () => {
  test("names the root", () => {
    expect(subprojectId("/repo", "/repo")).toBe("root");
  });

  test("flattens a nested path", () => {
    expect(subprojectId("/repo", "/repo/apps/Web")).toBe("apps-web");
  });
});
