import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { WorkspaceFs } from "../src/adapters/workspace-fs";

let base = "";
let root = "";
let workspace: WorkspaceFs;

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "hibi-ws-"));
  root = join(base, "repo");
  const outside = join(base, "outside");

  await mkdir(join(root, "src", "deep"), { recursive: true });
  await mkdir(join(root, ".git"), { recursive: true });
  await mkdir(join(root, "node_modules", "lib"), { recursive: true });
  await mkdir(outside, { recursive: true });

  await writeFile(join(root, "src", "deep", "a.ts"), "export const a = 1;\n");
  await writeFile(join(root, ".env"), "API_KEY=secret\n");
  await writeFile(join(root, ".env.local"), "API_KEY=secret\n");
  await writeFile(join(root, ".env.example"), "API_KEY=\n");
  await writeFile(join(root, "server.pem"), "-----BEGIN-----\n");
  await writeFile(join(root, "id_ed25519"), "key\n");
  await writeFile(join(root, ".git", "config"), "[remote]\n");
  await writeFile(join(root, "node_modules", "lib", "index.js"), "x\n");
  await writeFile(join(outside, "secret.txt"), "outside\n");

  await symlink(outside, join(root, "escape"), "junction");

  workspace = new WorkspaceFs(root);
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("WorkspaceFs.listFiles", () => {
  test("lists with forward slashes and leaves out secrets, links and ignored directories", async () => {
    const result = await workspace.listFiles({ limit: 50 });
    const paths = result.entries.map((entry) => entry.path);

    expect(paths).toEqual([".env.example", "src/deep/a.ts"]);
    expect(result.truncated).toBe(false);
  });

  test("marks a list as truncated only when more files exist", async () => {
    const result = await workspace.listFiles({ limit: 1 });

    expect(result.entries).toHaveLength(1);
    expect(result.truncated).toBe(true);
    expect(result.nextCursor).toBe(".env.example");

    const rest = await workspace.listFiles({ limit: 1, cursor: ".env.example" });
    expect(rest.entries.map((entry) => entry.path)).toEqual(["src/deep/a.ts"]);
    expect(rest.truncated).toBe(false);
  });
});

describe("WorkspaceFs.readFile", () => {
  test("returns a nested file under its forward-slash path", async () => {
    const file = await workspace.readFile("src/deep/a.ts");
    expect(file.path).toBe("src/deep/a.ts");
    expect(file.text).toContain("export const a");
  });

  test("reads an env template", async () => {
    const file = await workspace.readFile(".env.example");
    expect(file.text).toBe("API_KEY=\n");
  });

  test.each([".env", ".env.local", "server.pem", "id_ed25519", ".git/config"])(
    "never reads %s",
    async (path) => {
      await expect(workspace.readFile(path)).rejects.toThrow("never read");
    },
  );

  test("refuses a path that climbs out of the root", async () => {
    await expect(workspace.readFile("../outside/secret.txt")).rejects.toThrow(
      "escapes workspace root",
    );
  });

  test("refuses a link that leads out of the root", async () => {
    await expect(workspace.readFile("escape/secret.txt")).rejects.toThrow(
      "escapes workspace root",
    );
  });

  test("reports a missing file without its absolute path", async () => {
    await expect(workspace.readFile("nope.ts")).rejects.toThrow(
      "no such file or directory: nope.ts",
    );
  });
});
