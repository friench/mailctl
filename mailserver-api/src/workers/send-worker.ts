import type { Logger } from '../logger';
import type { SendJobService } from '../domain/queue/service';
import type { FeatureFlagService } from '../domain/feature-flags/service';
import { PollingWorker } from './polling-worker';

export interface SendWorkerOptions {
  pollIntervalMs?: number;
  flags?: FeatureFlagService;
}

/**
 * Polls the send-jobs queue and processes ready jobs serially.
 * Single-instance per process; safe for single-node deployments.
 */
export class SendWorker extends PollingWorker {
  constructor(
    private readonly service: SendJobService,
    logger: Logger,
    private readonly opts: SendWorkerOptions = {},
  ) {
    super({ name: 'Send worker', intervalMs: opts.pollIntervalMs ?? 2_000, logger });
  }

  protected isEnabled(): boolean {
    return !this.opts.flags || this.opts.flags.isEnabled('queue_enabled');
  }

  protected tick(): Promise<boolean> {
    return this.service.processOne();
  }
}
