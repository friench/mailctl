import type { Logger } from '../../logger';
import type { SendJobRepository } from '../queue/repository';
import type { WebhookDeliveryRepository } from '../webhooks/delivery-repository';
import type { BounceRepository } from '../bounces/repository';
import type { MigrationJobRepository } from '../migrations/repository';

export interface PruneResult {
  sendJobs: number;
  webhookDeliveries: number;
  bounceEvents: number;
  migrationJobs: number;
}

const DAY_MS = 24 * 60 * 60 * 1_000;

/**
 * Deletes finished (done/dead) send jobs and webhook deliveries, bounce events,
 * and terminal migration jobs older than a retention window, keeping the SQLite
 * DB (and every backup) from growing without bound.
 */
export class RetentionService {
  constructor(
    private readonly sendJobRepo: SendJobRepository,
    private readonly webhookDeliveryRepo: WebhookDeliveryRepository,
    private readonly bounceRepo: BounceRepository,
    private readonly migrationRepo: MigrationJobRepository,
    private readonly logger: Logger,
  ) {}

  /**
   * Delete finished/old rows older than `retentionDays`.
   * A `retentionDays <= 0` is a no-op (returns zeros).
   */
  prune(retentionDays: number, now: Date = new Date()): PruneResult {
    if (retentionDays <= 0) {
      return { sendJobs: 0, webhookDeliveries: 0, bounceEvents: 0, migrationJobs: 0 };
    }
    const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
    const result: PruneResult = {
      sendJobs: this.sendJobRepo.deleteFinishedBefore(cutoff),
      webhookDeliveries: this.webhookDeliveryRepo.deleteFinishedBefore(cutoff),
      bounceEvents: this.bounceRepo.deleteBefore(cutoff),
      migrationJobs: this.migrationRepo.deleteFinishedBefore(cutoff),
    };
    this.logger.info(
      { retentionDays, cutoff: cutoff.toISOString(), ...result },
      'Retention prune complete',
    );
    return result;
  }
}
