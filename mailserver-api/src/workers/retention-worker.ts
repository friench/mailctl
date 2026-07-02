import type { Logger } from '../logger';
import type { RetentionService } from '../domain/retention/service';
import { PollingWorker, type StartupGuard } from './polling-worker';

export interface RetentionWorkerOptions {
  /** How many days of finished rows to keep. <= 0 disables the worker. */
  retentionDays: number;
  /** Interval between prune ticks. Defaults to 24h. */
  intervalMs?: number;
}

/** Periodically prunes finished send jobs / webhook deliveries beyond the retention window. */
export class RetentionWorker extends PollingWorker {
  constructor(
    private readonly service: RetentionService,
    logger: Logger,
    private readonly opts: RetentionWorkerOptions,
  ) {
    super({
      name: 'Retention worker',
      intervalMs: opts.intervalMs ?? 24 * 60 * 60 * 1_000,
      logger,
      sleepFirst: true,
    });
  }

  protected startupGuard(): StartupGuard {
    if (this.opts.retentionDays <= 0) {
      return { run: false, reason: 'Retention worker disabled (RETENTION_DAYS <= 0)' };
    }
    return { run: true };
  }

  protected async tick(): Promise<boolean> {
    this.service.prune(this.opts.retentionDays);
    return false;
  }
}
