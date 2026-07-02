import type { Logger } from '../logger';
import type { WebhookService } from '../domain/webhooks/service';
import type { FeatureFlagService } from '../domain/feature-flags/service';
import { PollingWorker } from './polling-worker';

export interface WebhookWorkerOptions {
  pollIntervalMs?: number;
  flags?: FeatureFlagService;
}

/** Polls webhook_deliveries for pending events and POSTs them to subscriber URLs. */
export class WebhookWorker extends PollingWorker {
  constructor(
    private readonly service: WebhookService,
    logger: Logger,
    private readonly opts: WebhookWorkerOptions = {},
  ) {
    super({ name: 'Webhook worker', intervalMs: opts.pollIntervalMs ?? 2_000, logger });
  }

  protected isEnabled(): boolean {
    return !this.opts.flags || this.opts.flags.isEnabled('webhook_worker_enabled');
  }

  protected tick(): Promise<boolean> {
    return this.service.processOne();
  }
}
