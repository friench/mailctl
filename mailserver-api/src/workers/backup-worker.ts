import type { Logger } from '../logger';
import type { BackupService } from '../domain/backups/service';
import type { FeatureFlagService } from '../domain/feature-flags/service';
import { PollingWorker } from './polling-worker';

export interface BackupWorkerOptions {
  /** Interval between backup ticks. Defaults to 24h. */
  intervalMs?: number;
  flags?: FeatureFlagService;
}

/** Periodically runs online backups of the panel SQLite DB, gated on `backups_enabled`. */
export class BackupWorker extends PollingWorker {
  constructor(
    private readonly service: BackupService,
    logger: Logger,
    private readonly opts: BackupWorkerOptions = {},
  ) {
    super({
      name: 'Backup worker',
      intervalMs: opts.intervalMs ?? 24 * 60 * 60 * 1_000,
      logger,
      sleepFirst: true,
    });
  }

  protected isEnabled(): boolean {
    return !this.opts.flags || this.opts.flags.isEnabled('backups_enabled');
  }

  protected async tick(): Promise<boolean> {
    const result = await this.service.runBackup();
    this.logger.info(result, 'Scheduled backup complete');
    return false;
  }
}
