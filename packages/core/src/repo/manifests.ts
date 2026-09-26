import { readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

export interface ManifestInfo {
  languages: string[];
  languageVersion?: string;
  dependencies: string[];
  testCommand?: string;
  entrypoints: string[];
}

type Parser = (text: string, dir: string) => ManifestInfo | null;

const MAX_DEPENDENCIES = 20;

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

export async function readManifest(
  path: string,
  dir: string,
): Promise<ManifestInfo | null> {
  const name = path.split("/").pop() ?? "";
  const parse = MANIFEST_PARSERS[name];
  if (parse === undefined) return null;

  try {
    return parse(await readFile(path, "utf8"), dir);
  } catch {
    return null;
  }
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
    entrypoints: [],
  };
}

function parsePackageJson(text: string): ManifestInfo | null {
  const json = JSON.parse(text) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
    engines?: { node?: string };
    main?: string;
  };

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
    entrypoints: json.main === undefined ? [] : [json.main],
  };
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
    entrypoints: [],
  };
}

/** Subproject id from its path: "." becomes "root", "apps/web" becomes "apps-web" */
export function subprojectId(repoRoot: string, dir: string): string {
  const rel = relative(repoRoot, dir);
  if (rel.length === 0) return "root";
  return rel.replace(/[/\\]/g, "-").toLowerCase();
}

export function manifestDir(path: string): string {
  return dirname(path);
}

export function manifestPath(dir: string, name: string): string {
  return join(dir, name);
}
