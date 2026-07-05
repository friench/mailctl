import type { Logger } from '../logger';
import type { MigrationService } from '../domain/migrations/service';
import { PollingWorker } from './polling-worker';

export interface MigrationWorkerOptions {
  pollIntervalMs?: number;
}

/**
 * Processes IMAP migration jobs serially (dsync is heavy; one at a time). Mirrors
 * the send worker: drains the queue, sleeping the interval only when idle.
 */
export class MigrationWorker extends PollingWorker {
  constructor(
    private readonly service: MigrationService,
    logger: Logger,
    opts: MigrationWorkerOptions = {},
  ) {
    super({ name: 'Migration worker', intervalMs: opts.pollIntervalMs ?? 5_000, logger });
  }

  protected tick(): Promise<boolean> {
    return this.service.processOne();
  }
}
