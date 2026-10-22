import { stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { readAuthorship } from "./git";
import { isCodeFile, isGenerated, languageOf } from "./ignore";
import { MANIFEST_PARSERS, readManifest, subprojectId } from "./manifests";
import { toRepoPath, walkFiles, type WalkedFile } from "./walk";
import type { FileOrigin, RepoModel, Subproject } from "../schemas/repo";
import { REPO_MODEL_SCHEMA_VERSION } from "../schemas/repo";

const LIMITS = {
  filesWalked: 20_000,
  authoredFiles: 40,
  treeEntries: 60,
  treeDepth: 3,
  subprojects: 12,
} as const;

/** Minimum lines written for a file to count as the user's own work */
const AUTHORSHIP_THRESHOLD = 10;

const MAX_INDEXED_BYTES = 1024 * 1024;

/**
 * Builds the repository model: what the project is, which parts the learner
 * wrote, and how to run its tests
 */
export async function indexRepo(
  repoRoot: string,
  now: Date,
): Promise<RepoModel> {
  const root = resolve(repoRoot);
  const { files, manifests } = await walk(root);
  const authorship = await readAuthorship(
    root,
    new Set(files.map((file) => file.path)),
  );

  const subprojects = await buildSubprojects(root, manifests, files);
  const origins = classify(files, authorship.linesByFile, authorship.hasGit);

  const authored = [...authorship.linesByFile.entries()]
    .filter(
      ([path, lines]) =>
        lines >= AUTHORSHIP_THRESHOLD && origins.get(path) === "user",
    )
    .sort((a, b) => b[1] - a[1])
    .slice(0, LIMITS.authoredFiles)
    .map(([path]) => path);

  return {
    schemaVersion: REPO_MODEL_SCHEMA_VERSION,
    repoRoot: root,
    indexedAt: now.toISOString(),
    hasGit: authorship.hasGit,
    subprojects,
    fileStats: countOrigins(origins),
    userAuthoredFiles: authored,
    treeSummary: renderTree(files),
  };
}

async function walk(
  root: string,
): Promise<{ files: WalkedFile[]; manifests: string[] }> {
  const files: WalkedFile[] = [];
  const manifests: string[] = [];

  for await (const file of walkFiles(root)) {
    if (MANIFEST_PARSERS[file.name] !== undefined) {
      manifests.push(file.absolute);
    }
    if (!isCodeFile(file.name)) continue;
    if (!(await withinSizeLimit(file.absolute))) continue;

    files.push(file);
    if (files.length >= LIMITS.filesWalked) break;
  }

  return { files, manifests };
}

async function withinSizeLimit(path: string): Promise<boolean> {
  try {
    return (await stat(path)).size <= MAX_INDEXED_BYTES;
  } catch {
    return false;
  }
}

/**
 * One subproject per manifest found, so a monorepo keeps a correct language,
 * version and test command per directory
 */
async function buildSubprojects(
  root: string,
  manifests: string[],
  files: WalkedFile[],
): Promise<Subproject[]> {
  const subprojects: Subproject[] = [];

  for (const path of manifests.slice(0, LIMITS.subprojects)) {
    const dir = dirname(path);
    const info = await readManifest(path, dir, root);
    if (info === null) continue;

    subprojects.push({
      id: subprojectId(root, dir),
      path: toRepoPath(root, dir) || ".",
      languages: info.languages,
      languageVersion: info.languageVersion,
      testCommand: info.testCommand,
      testRunner: info.testRunner,
    });
  }

  if (subprojects.length > 0) return subprojects;

  return [
    {
      id: "root",
      path: ".",
      languages: dominantLanguages(files),
    },
  ];
}

function dominantLanguages(files: WalkedFile[]): string[] {
  const counts = new Map<string, number>();

  for (const file of files) {
    const language = languageOf(file.name);
    if (language === null) continue;
    counts.set(language, (counts.get(language) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([language]) => language);
}

/**
 * Classifies each file by who wrote it. Without git nothing can be attributed,
 * so everything the walk kept is `unknown`
 */
function classify(
  files: WalkedFile[],
  linesByFile: Map<string, number>,
  hasGit: boolean,
): Map<string, FileOrigin> {
  const origins = new Map<string, FileOrigin>();

  for (const file of files) {
    if (isGenerated(file.name)) {
      origins.set(file.path, "generated");
      continue;
    }
    if (!hasGit) {
      origins.set(file.path, "unknown");
      continue;
    }
    origins.set(
      file.path,
      (linesByFile.get(file.path) ?? 0) >= AUTHORSHIP_THRESHOLD
        ? "user"
        : "external",
    );
  }

  return origins;
}

function countOrigins(origins: Map<string, FileOrigin>) {
  const stats = { total: 0, user: 0, external: 0, generated: 0, unknown: 0 };

  for (const origin of origins.values()) {
    stats.total += 1;
    stats[origin] += 1;
  }
  return stats;
}

/** Renders a directory tree with file counts */
function renderTree(files: WalkedFile[]): string {
  const counts = new Map<string, number>();

  for (const file of files) {
    const parts = file.path.split("/");
    const depth = Math.min(parts.length - 1, LIMITS.treeDepth);
    const dir = depth === 0 ? "." : parts.slice(0, depth).join("/");
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, LIMITS.treeEntries)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([dir, count]) => `  ${dir}/ (${count})`)
    .join("\n");
}
