import { chmod, copyFile, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PACKAGE_DIR = join(import.meta.dir, "..");
const REPO_ROOT = join(PACKAGE_DIR, "..", "..");
const OUT_DIR = join(PACKAGE_DIR, "dist");
const OUT_FILE = join(OUT_DIR, "hibi.js");
const SHEBANG = "#!/usr/bin/env bun\n";

/** Files npm shows on the package page, copied from the repository root. */
const PUBLISHED_DOCS = ["README.md", "LICENSE"];

interface PackageManifest {
  dependencies?: Record<string, string>;
}

/**
 * Bundles the CLI with the workspace packages inlined into one executable file.
 *
 * Runtime dependencies stay external and are installed by npm; everything else,
 * including @hibi/core and @hibi/daemon, is bundled. The external list is read
 * from the manifest so it cannot drift from what npm will install.
 */
async function build(): Promise<void> {
  const manifest = (await Bun.file(
    join(PACKAGE_DIR, "package.json"),
  ).json()) as PackageManifest;
  const runtime = Object.keys(manifest.dependencies ?? {});
  const external = [...runtime, ...runtime.map((name) => `${name}/*`)];

  await rm(OUT_DIR, { recursive: true, force: true });

  const result = await Bun.build({
    entrypoints: [join(PACKAGE_DIR, "src", "main.tsx")],
    outdir: OUT_DIR,
    naming: "hibi.js",
    target: "bun",
    external,
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }

  const code = await readFile(OUT_FILE, "utf8");
  await writeFile(OUT_FILE, code.startsWith("#!") ? code : `${SHEBANG}${code}`);
  await chmod(OUT_FILE, 0o755);

  for (const file of PUBLISHED_DOCS) {
    await copyFile(join(REPO_ROOT, file), join(PACKAGE_DIR, file));
  }

  const size = (await Bun.file(OUT_FILE).arrayBuffer()).byteLength;
  console.log(`built ${OUT_FILE} (${(size / 1024).toFixed(0)} KB)`);
}

await build();
