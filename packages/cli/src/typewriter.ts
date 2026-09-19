const CHARS_PER_TICK = 3;
const TICK_MS = 16;

export class Typewriter {
  private queue = "";
  private timer: ReturnType<typeof setInterval> | null = null;
  private idle: (() => void) | null = null;

  constructor(
    private readonly write: (text: string) => void,
    private readonly charsPerTick = CHARS_PER_TICK,
    private readonly tickMs = TICK_MS,
  ) {}

  push(text: string): void {
    this.queue += text;
    this.start();
  }

  async drain(): Promise<void> {
    if (this.queue.length === 0) return;
    await new Promise<void>((resolve) => {
      this.idle = resolve;
    });
  }

  flush(): void {
    if (this.queue.length > 0) {
      this.write(this.queue);
      this.queue = "";
    }
    this.stop();
  }

  private start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.tick(), this.tickMs);
  }

  private tick(): void {
    if (this.queue.length === 0) {
      this.stop();
      const resolve = this.idle;
      this.idle = null;
      resolve?.();
      return;
    }

    const chunk = this.queue.slice(0, this.charsPerTick);
    this.queue = this.queue.slice(chunk.length);
    this.write(chunk);
  }

  private stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
