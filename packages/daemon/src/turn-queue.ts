/**
 * Serializes turns within a session. Two clients attached to the same daemon
 * would otherwise read the same state, apply divergent changes, and have the
 * later write erase the earlier one.
 */
export class TurnQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
