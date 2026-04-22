export function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>,
): readonly Promise<R>[] {
  const limit = Math.max(1, concurrency);
  const results: Promise<R>[] = new Array(items.length);
  let active = 0;
  let cursor = 0;
  const waiters: Array<() => void> = [];

  const acquire = (): Promise<void> => {
    if (active < limit) {
      active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => waiters.push(resolve));
  };

  const release = (): void => {
    active--;
    const next = waiters.shift();
    if (next) {
      active++;
      next();
    }
  };

  for (let i = 0; i < items.length; i++) {
    const index = i;
    const item = items[index]!;
    results[index] = acquire().then(async () => {
      try {
        return await task(item, index);
      } finally {
        release();
      }
    });
    cursor++;
  }
  void cursor;

  return results;
}
