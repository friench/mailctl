import { describe, it, expect } from 'vitest';
import { PollingWorker } from '../../src/workers/polling-worker';
import type { Logger } from '../../src/logger';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function makeLogger() {
  const info: unknown[][] = [];
  const error: unknown[][] = [];
  const logger = {
    info: (...args: unknown[]) => void info.push(args),
    error: (...args: unknown[]) => void error.push(args),
    warn: () => {},
    debug: () => {},
  } as unknown as Logger;
  return { logger, info, error };
}

/** Count log calls whose message argument equals `msg`. */
function countMessages(calls: unknown[][], msg: string): number {
  return calls.filter((args) => args.some((a) => a === msg)).length;
}

class TestWorker extends PollingWorker {
  public ticks = 0;
  public enabled = true;
  public tickResult = false;
  public tickImpl: (() => void) | null = null;

  constructor(logger: Logger, intervalMs: number, sleepFirst = false) {
    super({ name: 'Test worker', intervalMs, logger, sleepFirst });
  }

  protected isEnabled(): boolean {
    return this.enabled;
  }

  protected async tick(): Promise<boolean> {
    this.ticks++;
    if (this.tickImpl) this.tickImpl();
    return this.tickResult;
  }
}

describe('PollingWorker', () => {
  it('start() is idempotent — a second call does not spawn a second loop', async () => {
    const { logger, info } = makeLogger();
    const worker = new TestWorker(logger, 10_000); // long interval: parks after first tick
    worker.start();
    worker.start();
    await delay(10);

    expect(countMessages(info, 'Test worker started')).toBe(1);

    await worker.stop();
  });

  it('stop() resolves and halts the loop (no further ticks)', async () => {
    const { logger, info } = makeLogger();
    const worker = new TestWorker(logger, 5); // short interval: ticks repeatedly
    worker.start();
    await delay(30);
    expect(worker.ticks).toBeGreaterThan(0);

    await worker.stop();
    const after = worker.ticks;
    await delay(30);

    expect(worker.ticks).toBe(after);
    expect(countMessages(info, 'Test worker stopped')).toBe(1);
  });

  it('isEnabled() === false skips tick() (but keeps looping/sleeping)', async () => {
    const { logger } = makeLogger();
    const worker = new TestWorker(logger, 5);
    worker.enabled = false;
    worker.start();
    await delay(40);

    expect(worker.ticks).toBe(0);

    await worker.stop();
  });

  it('a throwing tick() does not kill the loop — the next iteration still runs', async () => {
    const { logger, error } = makeLogger();
    const worker = new TestWorker(logger, 5);
    worker.tickImpl = () => {
      if (worker.ticks === 1) throw new Error('boom');
    };
    worker.start();
    await delay(60);

    expect(worker.ticks).toBeGreaterThanOrEqual(2);
    expect(countMessages(error, 'Test worker iteration failed')).toBeGreaterThanOrEqual(1);

    await worker.stop();
  });

  it('drain mode: a tick() returning true loops again without waiting the interval', async () => {
    const { logger } = makeLogger();
    const worker = new TestWorker(logger, 60_000); // huge interval — must not be awaited
    worker.tickResult = true;
    worker.tickImpl = () => {
      // After 5 immediate iterations, report idle so the loop parks on the long sleep.
      if (worker.ticks >= 5) worker.tickResult = false;
    };
    worker.start();
    await delay(50);

    // 5 iterations completed in ~50ms, proving it did not wait the 60s interval.
    expect(worker.ticks).toBe(5);

    await worker.stop();
  });
});
