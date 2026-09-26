const DEFAULT_TIMEOUT_MS = 120_000;

const OUTPUT_HEAD_LINES = 40;
const OUTPUT_TAIL_LINES = 40;

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnError: string | null;
  durationMs: number;
}

export interface RunOptions {
  cwd: string;
  timeoutMs?: number;
}

export async function runCommand(
  argv: string[],
  options: RunOptions,
): Promise<CommandResult> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(argv, {
      cwd: options.cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (error) {
    return {
      exitCode: -1,
      stdout: "",
      stderr: "",
      timedOut: false,
      spawnError: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - started,
    };
  }

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(typeof proc.stdout === "number" ? null : proc.stdout).text(),
    new Response(typeof proc.stderr === "number" ? null : proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);

  return {
    exitCode,
    stdout,
    stderr,
    timedOut,
    spawnError: null,
    durationMs: Date.now() - started,
  };
}

export function truncateOutput(text: string): string {
  const lines = text.split("\n");
  if (lines.length <= OUTPUT_HEAD_LINES + OUTPUT_TAIL_LINES) return text.trim();

  const head = lines.slice(0, OUTPUT_HEAD_LINES);
  const tail = lines.slice(-OUTPUT_TAIL_LINES);
  const omitted = lines.length - head.length - tail.length;

  return [...head, `[… ${omitted} lines omitted …]`, ...tail].join("\n").trim();
}

export function parseCommand(command: string): string[] {
  return command.split(/\s+/).filter((part) => part.length > 0);
}
