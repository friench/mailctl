import type { Logger } from '../logger';

export interface PollingWorkerConfig {
  /** Human-readable name used in log lines (e.g. "Send worker"). */
  name: string;
  /** Interval, in ms, used when sleeping between ticks. */
  intervalMs: number;
  logger: Logger;
  /**
   * When true the worker sleeps the interval BEFORE every tick and never sleeps
   * after — the "periodic-delayed" shape used by the backup/retention workers
   * (first tick fires only after one interval). When false (default) the worker
   * ticks first and only sleeps when a tick reports no work — the "drain" shape
   * used by the send/webhook/sync workers.
   */
  sleepFirst?: boolean;
}

/** Result of the one-time startup guard: skip the loop entirely when `run` is false. */
export interface StartupGuard {
  run: boolean;
  /** Optional message logged (info) when `run` is false. */
  reason?: string;
}

/**
 * Shared lifecycle for the background workers. Owns the run loop, an
 * interruptible interval sleep (unref'd timer), and idempotent start/stop.
 * Subclasses provide {@link tick} (one unit of work) and optionally
 * {@link isEnabled} / {@link startupGuard}.
 */
export abstract class PollingWorker {
  private stopped = false;
  private currentLoop: Promise<void> | null = null;
  private currentTimer: NodeJS.Timeout | null = null;
  private wakeup: (() => void) | null = null;

  /** Injected logger, exposed for subclass tick() implementations. */
  protected readonly logger: Logger;

  protected constructor(private readonly config: PollingWorkerConfig) {
    this.logger = config.logger;
  }

  /** Per-iteration gate. Return false to skip {@link tick} and sleep instead. */
  protected isEnabled(): boolean {
    return true;
  }

  /**
   * One-time gate evaluated before the loop starts. Return `{ run: false }` to
   * skip the worker entirely (used by retention when disabled by config).
   */
  protected startupGuard(): StartupGuard {
    return { run: true };
  }

  /**
   * Perform one unit of work. Return true when work was done (drain workers loop
   * again immediately without sleeping) or false to sleep the interval. Periodic
   * workers always return false.
   */
  protected abstract tick(): Promise<boolean>;

  start(): void {
    if (this.currentLoop) return;
    this.stopped = false;
    this.currentLoop = this.run().catch((err) => {
      this.config.logger.error({ err }, `${this.config.name} crashed`);
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.currentTimer) {
      clearTimeout(this.currentTimer);
      this.currentTimer = null;
    }
    if (this.wakeup) {
      this.wakeup();
      this.wakeup = null;
    }
    if (this.currentLoop) {
      await this.currentLoop;
      this.currentLoop = null;
    }
  }

  private async run(): Promise<void> {
    const guard = this.startupGuard();
    if (!guard.run) {
      if (guard.reason) this.config.logger.info(guard.reason);
      return;
    }

    const interval = this.config.intervalMs;
    this.config.logger.info({ intervalMs: interval }, `${this.config.name} started`);

    while (!this.stopped) {
      if (this.config.sleepFirst) {
        await this.sleep(interval);
        if (this.stopped) break;
      }

      if (!this.isEnabled()) {
        if (!this.config.sleepFirst) await this.sleep(interval);
        continue;
      }

      let worked = false;
      try {
        worked = await this.tick();
      } catch (err) {
        this.config.logger.error({ err }, `${this.config.name} iteration failed`);
      }

      if (!this.config.sleepFirst && !worked) {
        await this.sleep(interval);
      }
    }

    this.config.logger.info(`${this.config.name} stopped`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.wakeup = resolve;
      this.currentTimer = setTimeout(() => {
        this.currentTimer = null;
        this.wakeup = null;
        resolve();
      }, ms);
      this.currentTimer.unref();
    });
  }
}
