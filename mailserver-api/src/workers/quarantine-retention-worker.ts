import type { Logger } from '../logger';
import type { QuarantineService } from '../domain/quarantine/service';
import type { MailboxRepository } from '../domain/mailboxes/repository';
import type { FeatureFlagService } from '../domain/feature-flags/service';
import { PollingWorker } from './polling-worker';

export interface QuarantineRetentionWorkerOptions {
  /** Expunge Junk messages older than this many days. */
  retentionDays: number;
  /** How often to sweep. Defaults to 24 hours. */
  pollIntervalMs?: number;
  flags?: FeatureFlagService;
}

/**
 * Optional janitor. When `quarantine_retention_enabled` is on, periodically
 * expunges spam older than `retentionDays` from every mailbox's Junk folder so
 * quarantines don't grow unbounded. Off by default; never touches the inbox.
 */
export class QuarantineRetentionWorker extends PollingWorker {
  constructor(
    private readonly quarantine: QuarantineService,
    private readonly mailboxRepo: MailboxRepository,
    logger: Logger,
    private readonly opts: QuarantineRetentionWorkerOptions,
  ) {
    super({
      name: 'Quarantine retention worker',
      intervalMs: opts.pollIntervalMs ?? 24 * 60 * 60_000,
      logger,
      sleepFirst: true,
    });
  }

  protected isEnabled(): boolean {
    return !!this.opts.flags && this.opts.flags.isEnabled('quarantine_retention_enabled');
  }

  protected async tick(): Promise<boolean> {
    const removed = await this.quarantine.purge(this.mailboxRepo.list(), this.opts.retentionDays);
    if (removed > 0) {
      this.logger.info(
        { removed, retentionDays: this.opts.retentionDays },
        'Quarantine retention: expunged old spam',
      );
    }
    return false;
  }
}
