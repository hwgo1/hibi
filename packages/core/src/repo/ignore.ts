/**
 * Directories never walked. They hold code the learner did not write, so
 * including them both floods the context window and pollutes the signal used
 * to calibrate teaching
 */
export const IGNORED_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "out",
  "target",
  "bin",
  "obj",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".cache",
  ".turbo",
  "coverage",
  ".gradle",
  "Pods",
  ".idea",
  ".vscode",
]);

/** File names that are machine-written even outside an ignored directory */
const GENERATED_FILES = new Set([
  "package-lock.json",
  "bun.lockb",
  "bun.lock",
  "yarn.lock",
  "pnpm-lock.yaml",
  "go.sum",
  "Cargo.lock",
  "poetry.lock",
  "uv.lock",
  "composer.lock",
  "Gemfile.lock",
  "Podfile.lock",
]);

const GENERATED_PATTERNS = [
  /\.min\.(js|css)$/,
  /\.generated\./,
  /\.pb\.go$/,
  /_pb2\.py$/,
  /\.g\.dart$/,
  /\.designer\.cs$/i,
];

export function isGenerated(fileName: string): boolean {
  if (GENERATED_FILES.has(fileName)) return true;
  return GENERATED_PATTERNS.some((pattern) => pattern.test(fileName));
}

/** Extensions excluded from indexing */
const NON_CODE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "ico",
  "bmp",
  "tiff",
  "avif",
  "mp3",
  "mp4",
  "wav",
  "mov",
  "avi",
  "webm",
  "ogg",
  "flac",
  "m4a",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
  "zip",
  "tar",
  "gz",
  "tgz",
  "bz2",
  "xz",
  "7z",
  "rar",
  "jar",
  "war",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "odt",
  "ods",
  "exe",
  "dll",
  "so",
  "dylib",
  "bin",
  "o",
  "a",
  "class",
  "wasm",
  "pyc",
  "pdb",
  "db",
  "sqlite",
  "sqlite3",
  "mdb",
  "lock",
  "log",
  "map",
  "snap",
  "csv",
  "tsv",
  "parquet",
  "psd",
  "ai",
  "sketch",
  "fig",
  "blend",
]);

/** Whether a file is worth indexing. Files with no extension are skipped */
export function isCodeFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  const extension = lower.split(".").pop();

  if (extension === undefined) return false;
  if (extension === lower) return false;
  return !NON_CODE_EXTENSIONS.has(extension);
}

/**
 * Display name for a file's language. An unmapped extension only means the
 * file does not contribute to the language list; it is still indexed and
 * still counts toward authorship
 */
export function languageOf(fileName: string): string | null {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === undefined) return null;

  const byExtension: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TypeScript",
    mts: "TypeScript",
    cts: "TypeScript",
    js: "JavaScript",
    jsx: "JavaScript",
    mjs: "JavaScript",
    cjs: "JavaScript",
    go: "Go",
    rs: "Rust",
    py: "Python",
    rb: "Ruby",
    java: "Java",
    kt: "Kotlin",
    kts: "Kotlin",
    swift: "Swift",
    scala: "Scala",
    clj: "Clojure",
    c: "C",
    h: "C",
    cpp: "C++",
    cc: "C++",
    cxx: "C++",
    hpp: "C++",
    hh: "C++",
    cs: "C#",
    fs: "F#",
    php: "PHP",
    ex: "Elixir",
    exs: "Elixir",
    erl: "Erlang",
    hs: "Haskell",
    ml: "OCaml",
    zig: "Zig",
    lua: "Lua",
    dart: "Dart",
    r: "R",
    jl: "Julia",
    nim: "Nim",
    pl: "Perl",
    sql: "SQL",
    sh: "Shell",
    bash: "Shell",
    zsh: "Shell",
    fish: "Shell",
    ps1: "PowerShell",
    html: "HTML",
    css: "CSS",
    scss: "CSS",
    sass: "CSS",
    less: "CSS",
    vue: "Vue",
    svelte: "Svelte",
    astro: "Astro",
    tf: "Terraform",
    proto: "Protobuf",
  };

  return byExtension[extension] ?? null;
}
