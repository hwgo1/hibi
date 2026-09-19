import { ui } from "./render";

const BRAILLE = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const ASCII = ["|", "/", "-", "\\"];
const FRAME_MS = 80;

export class Spinner {
  private readonly frames: string[];
  private timer: ReturnType<typeof setInterval> | null = null;
  private index = 0;
  private label = "";

  constructor(private readonly write: (text: string) => void) {
    this.frames = supportsUnicode() ? BRAILLE : ASCII;
  }

  start(label: string): void {
    if (process.stdout.isTTY !== true) return;
    this.label = label;
    this.stop();
    this.timer = setInterval(() => this.render(), FRAME_MS);
    this.render();
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
    this.write(`\r\x1b[2K`);
  }

  private render(): void {
    const frame = this.frames[this.index % this.frames.length] ?? "";
    this.index += 1;
    this.write(`\r\x1b[2K${ui.fox(frame)} ${ui.dim(this.label)}`);
  }
}

function supportsUnicode(): boolean {
  const term = process.env["TERM"] ?? "";
  const ctype =
    process.env["LC_ALL"] ??
    process.env["LC_CTYPE"] ??
    process.env["LANG"] ??
    "";
  if (term === "dumb") return false;
  return /UTF-?8/i.test(ctype) || process.platform === "darwin";
}
