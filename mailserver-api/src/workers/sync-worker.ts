import type { Logger } from '../logger';
import type { SyncService } from '../domain/sync/service';
import type { WebhookService } from '../domain/webhooks/service';
import type { FeatureFlagService } from '../domain/feature-flags/service';
import { PollingWorker } from './polling-worker';

export interface SyncWorkerOptions {
  /** How often to recompute the diff. Defaults to 15 minutes. */
  pollIntervalMs?: number;
  flags?: FeatureFlagService;
}

/**
 * Optional background notifier. When `sync_preview_notify` is enabled, periodically
 * computes the DMS↔DB divergence and emits a log line + `sync.divergence_detected`
 * webhook when any divergence exists. It NEVER applies anything — application is
 * always operator-confirmed.
 */
export class SyncWorker extends PollingWorker {
  constructor(
    private readonly sync: SyncService,
    private readonly webhooks: WebhookService,
    logger: Logger,
    private readonly opts: SyncWorkerOptions = {},
  ) {
    super({ name: 'Sync worker', intervalMs: opts.pollIntervalMs ?? 15 * 60_000, logger });
  }

  protected isEnabled(): boolean {
    return !!this.opts.flags && this.opts.flags.isEnabled('sync_preview_notify');
  }

  protected async tick(): Promise<boolean> {
    const count = await this.sync.divergenceCount();
    if (count > 0) {
      this.logger.warn({ count }, 'DMS↔DB divergence detected');
      this.webhooks.dispatch('sync.divergence_detected', {
        count,
        detectedAt: new Date().toISOString(),
      });
    }
    return false;
  }
}
