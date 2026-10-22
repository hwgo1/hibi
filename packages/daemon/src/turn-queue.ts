/**
 * Serializes every state-changing request in the daemon. Spaces share the
 * learner model, the concept registry and the evidence log, so two turns
 * running at once would read the same state and the later write would erase
 * the earlier one.
 */
export class TurnQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
