import { access, readFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";

import type { TestRunner } from "../schemas/check";

export interface ManifestInfo {
  languages: string[];
  languageVersion?: string;
  dependencies: string[];
  testCommand?: string;
  testRunner?: TestRunner;
  entrypoints: string[];
}

type Parser = (text: string, dir: string) => ManifestInfo | null;

const MAX_DEPENDENCIES = 20;

const BUN_LOCKFILES = ["bun.lock", "bun.lockb"];

/**
 * Manifest file names that mark a subproject root. A repository with several
 * of these is a monorepo, and each one becomes its own entry so that language,
 * version and test command stay correct per directory
 */
export const MANIFEST_PARSERS: Record<string, Parser> = {
  "go.mod": parseGoMod,
  "package.json": parsePackageJson,
  "Cargo.toml": parseCargoToml,
  "pyproject.toml": parsePyproject,
};

/** `root` bounds the Bun lockfile search: workspaces keep it at the root */
export async function readManifest(
  path: string,
  dir: string,
  root: string = dir,
): Promise<ManifestInfo | null> {
  const name = basename(path);
  const parse = MANIFEST_PARSERS[name];
  if (parse === undefined) return null;

  let info: ManifestInfo | null;
  try {
    info = parse(await readFile(path, "utf8"), dir);
  } catch {
    return null;
  }

  if (
    info !== null &&
    name === "package.json" &&
    info.testCommand === undefined &&
    info.testRunner === undefined &&
    (await hasBunLockfile(dir, root))
  ) {
    return { ...info, testCommand: "bun test", testRunner: "bun" };
  }
  return info;
}

function parseGoMod(text: string): ManifestInfo {
  const version = /^go\s+(\d+\.\d+(?:\.\d+)?)/m.exec(text)?.[1];
  const requires = [...text.matchAll(/^\s+([\w./-]+)\s+v/gm)].map(
    (match) => match[1] ?? "",
  );

  return {
    languages: ["Go"],
    languageVersion: version,
    dependencies: requires
      .filter((name) => name.length > 0)
      .slice(0, MAX_DEPENDENCIES),
    testCommand: "go test ./...",
    testRunner: "go",
    entrypoints: [],
  };
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  engines?: { node?: string };
  main?: string;
}

function parsePackageJson(text: string): ManifestInfo | null {
  const json = JSON.parse(text) as PackageJson;

  const dependencies = Object.keys({
    ...json.dependencies,
    ...json.devDependencies,
  });
  const hasTypeScript = dependencies.includes("typescript");
  const testScript = json.scripts?.["test"];

  return {
    languages: hasTypeScript ? ["TypeScript"] : ["JavaScript"],
    languageVersion: json.engines?.node,
    dependencies: dependencies.slice(0, MAX_DEPENDENCIES),
    testCommand: testScript === undefined ? undefined : "npm test",
    testRunner: jsTestRunner(testScript, dependencies),
    entrypoints: json.main === undefined ? [] : [json.main],
  };
}

/** A test script decides alone; without one, a runner in the dependencies decides */
function jsTestRunner(
  script: string | undefined,
  dependencies: string[],
): TestRunner | undefined {
  if (script !== undefined) {
    if (/\bvitest\b/.test(script)) return "vitest";
    if (/\bjest\b/.test(script)) return "jest";
    if (/\bbun test\b/.test(script)) return "bun";
    return undefined;
  }

  if (dependencies.includes("vitest")) return "vitest";
  if (dependencies.includes("jest")) return "jest";
  return undefined;
}

function parseCargoToml(text: string): ManifestInfo {
  const version = /^edition\s*=\s*"(\d+)"/m.exec(text)?.[1];
  const section = /\[dependencies\]([\s\S]*?)(\n\[|$)/.exec(text)?.[1] ?? "";
  const names = [...section.matchAll(/^([\w-]+)\s*=/gm)].map(
    (match) => match[1] ?? "",
  );

  return {
    languages: ["Rust"],
    languageVersion: version === undefined ? undefined : `edition ${version}`,
    dependencies: names
      .filter((name) => name.length > 0)
      .slice(0, MAX_DEPENDENCIES),
    testCommand: "cargo test",
    testRunner: "cargo",
    entrypoints: [],
  };
}

function parsePyproject(text: string): ManifestInfo {
  const version = /requires-python\s*=\s*"([^"]+)"/.exec(text)?.[1];
  const section = /dependencies\s*=\s*\[([\s\S]*?)\]/.exec(text)?.[1] ?? "";
  const names = [...section.matchAll(/"([\w-]+)/g)].map(
    (match) => match[1] ?? "",
  );

  return {
    languages: ["Python"],
    languageVersion: version,
    dependencies: names
      .filter((name) => name.length > 0)
      .slice(0, MAX_DEPENDENCIES),
    testCommand: "pytest",
    testRunner: "pytest",
    entrypoints: [],
  };
}

async function hasBunLockfile(dir: string, root: string): Promise<boolean> {
  for (let current = dir; ; current = dirname(current)) {
    for (const name of BUN_LOCKFILES) {
      if (await exists(join(current, name))) return true;
    }
    if (current === root || dirname(current) === current) return false;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Subproject id from its path: "." becomes "root", "apps/web" becomes "apps-web" */
export function subprojectId(repoRoot: string, dir: string): string {
  const rel = relative(repoRoot, dir);
  if (rel.length === 0) return "root";
  return rel.replace(/[/\\]/g, "-").toLowerCase();
}
