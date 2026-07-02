import type { Logger } from '../../logger';
import type { SendJobRepository } from '../queue/repository';
import type { WebhookDeliveryRepository } from '../webhooks/delivery-repository';

export interface PruneResult {
  sendJobs: number;
  webhookDeliveries: number;
}

const DAY_MS = 24 * 60 * 60 * 1_000;

/**
 * Deletes finished (done/dead) send jobs and webhook deliveries older than a retention
 * window, keeping the SQLite DB (and every backup) from growing without bound.
 */
export class RetentionService {
  constructor(
    private readonly sendJobRepo: SendJobRepository,
    private readonly webhookDeliveryRepo: WebhookDeliveryRepository,
    private readonly logger: Logger,
  ) {}

  /**
   * Delete finished rows whose completedAt is older than `retentionDays`.
   * A `retentionDays <= 0` is a no-op (returns zeros).
   */
  prune(retentionDays: number, now: Date = new Date()): PruneResult {
    if (retentionDays <= 0) {
      return { sendJobs: 0, webhookDeliveries: 0 };
    }
    const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
    const sendJobsDeleted = this.sendJobRepo.deleteFinishedBefore(cutoff);
    const webhookDeliveriesDeleted = this.webhookDeliveryRepo.deleteFinishedBefore(cutoff);
    this.logger.info(
      {
        retentionDays,
        cutoff: cutoff.toISOString(),
        sendJobs: sendJobsDeleted,
        webhookDeliveries: webhookDeliveriesDeleted,
      },
      'Retention prune complete',
    );
    return { sendJobs: sendJobsDeleted, webhookDeliveries: webhookDeliveriesDeleted };
  }
}
