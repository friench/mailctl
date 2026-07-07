import { BusinessError } from '../../lib/errors';
import { assertPublicUrl } from '../../lib/ssrf';
import { signWebhookPayload, generateWebhookSecret } from '../../lib/webhook-signature';
import { webhookDeliveredTotal, webhookFailedTotal } from '../../lib/metrics';
import type { EventDispatcher } from '../events/types';
import type { FeatureFlagService } from '../feature-flags/service';
import type { Logger } from '../../logger';
import type { WebhookDeliveryRow, WebhookEvent, WebhookRow } from '../../db/schema';
import type { WebhookRepository } from './repository';
import type { WebhookDeliveryRepository } from './delivery-repository';

const BASE_BACKOFF_MS = 30_000;
const MAX_RESPONSE_BODY_LENGTH = 1_000;
const REQUEST_TIMEOUT_MS = 10_000;

export function computeBackoffMs(attempts: number): number {
  return BASE_BACKOFF_MS * Math.pow(2, Math.max(0, attempts - 1));
}

export interface CreatedWebhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: Date;
  /** Plain secret — shown ONLY on creation. */
  secret: string;
}

export interface CreateWebhookInput {
  name: string;
  url: string;
  events: string[];
  active?: boolean;
}

export interface UpdateWebhookInput {
  name?: string;
  url?: string;
  events?: string[];
  active?: boolean;
}

export interface WebhookServiceOptions {
  /** Allow delivery to private/loopback/internal targets (SSRF opt-out). */
  allowPrivate?: boolean;
}

export class WebhookService implements EventDispatcher {
  private readonly allowPrivate: boolean;

  constructor(
    private readonly repo: WebhookRepository,
    private readonly deliveryRepo: WebhookDeliveryRepository,
    private readonly logger: Logger,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
    private readonly flags?: FeatureFlagService,
    options: WebhookServiceOptions = {},
  ) {
    this.allowPrivate = options.allowPrivate ?? false;
  }

  // ---------- CRUD ----------

  list(): WebhookRow[] {
    return this.repo.list();
  }

  findById(id: string): WebhookRow | undefined {
    return this.repo.findById(id);
  }

  create(input: CreateWebhookInput): CreatedWebhook {
    const secret = generateWebhookSecret();
    const row = this.repo.create({ ...input, secret });
    return {
      id: row.id,
      name: row.name,
      url: row.url,
      events: row.events,
      active: row.active,
      createdAt: row.createdAt,
      secret,
    };
  }

  update(id: string, input: UpdateWebhookInput): WebhookRow {
    const row = this.repo.update(id, input);
    if (!row) throw new BusinessError(404, 'Webhook not found');
    return row;
  }

  delete(id: string): void {
    if (!this.repo.delete(id)) {
      throw new BusinessError(404, 'Webhook not found');
    }
  }

  listDeliveries(webhookId: string, limit = 50): WebhookDeliveryRow[] {
    return this.deliveryRepo.listByWebhook(webhookId, limit);
  }

  // ---------- Event dispatch ----------

  dispatch(event: WebhookEvent, payload: Record<string, unknown>): void {
    if (this.flags && !this.flags.isEnabled('webhooks_enabled')) {
      this.logger.debug({ event }, 'Webhooks disabled; skipping dispatch');
      return;
    }
    const subscribers = this.repo.findActiveByEvent(event);
    if (subscribers.length === 0) return;
    for (const wh of subscribers) {
      this.deliveryRepo.create({ webhookId: wh.id, event, payload });
    }
    this.logger.debug({ event, count: subscribers.length }, 'Dispatched webhook event');
  }

  /** Synthetic test ping. Creates a delivery and returns it; worker (or processSpecific) sends. */
  enqueueTest(webhookId: string): WebhookDeliveryRow {
    const webhook = this.repo.findById(webhookId);
    if (!webhook) throw new BusinessError(404, 'Webhook not found');
    return this.deliveryRepo.create({
      webhookId: webhook.id,
      event: 'webhook.test',
      payload: { message: 'Test ping from mail-api', sentAt: new Date().toISOString() },
    });
  }

  // ---------- Worker / processing ----------

  async processOne(now: Date = new Date()): Promise<boolean> {
    const claim = this.deliveryRepo.claimNextPending(now);
    if (!claim) return false;
    await this.deliver(claim);
    return true;
  }

  async processSpecific(deliveryId: string, now: Date = new Date()): Promise<WebhookDeliveryRow> {
    const existing = this.deliveryRepo.findById(deliveryId);
    if (!existing) throw new BusinessError(404, 'Delivery not found');
    if (existing.status !== 'pending') return existing;

    const claimed = this.deliveryRepo.claimById(deliveryId, now);
    if (!claimed) {
      const after = this.deliveryRepo.findById(deliveryId);
      if (!after) throw new BusinessError(404, 'Delivery not found');
      return after;
    }
    await this.deliver(claimed);
    return this.deliveryRepo.findById(deliveryId)!;
  }

  recoverStuckDeliveries(): number {
    const count = this.deliveryRepo.resetProcessingToPending();
    if (count > 0) {
      this.logger.warn({ count }, 'Recovered stuck webhook deliveries from previous run');
    }
    return count;
  }

  private async deliver(delivery: WebhookDeliveryRow): Promise<void> {
    if (!delivery.webhookId) {
      this.deliveryRepo.markDead(delivery.id, 'Webhook was deleted', null);
      return;
    }
    const webhook = this.repo.findById(delivery.webhookId);
    if (!webhook) {
      this.deliveryRepo.markDead(delivery.id, 'Webhook was deleted', null);
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
      event: delivery.event,
      timestamp,
      data: delivery.payload,
    });
    const signature = signWebhookPayload(webhook.secret, timestamp, body);

    try {
      await assertPublicUrl(webhook.url, { allowPrivate: this.allowPrivate });

      const res = await this.fetchImpl(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': `sha256=${signature}`,
          'X-Webhook-Timestamp': String(timestamp),
          'X-Webhook-Event': delivery.event,
          'X-Webhook-Id': delivery.id,
        },
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const responseBody = (await res.text().catch(() => '')).slice(0, MAX_RESPONSE_BODY_LENGTH);

      if (res.ok) {
        this.deliveryRepo.markDone(delivery.id, res.status, responseBody);
        webhookDeliveredTotal.inc();
        this.logger.info(
          { deliveryId: delivery.id, status: res.status, event: delivery.event },
          'Webhook delivered',
        );
        return;
      }

      const message = `HTTP ${res.status}`;
      if (delivery.attempts >= delivery.maxAttempts) {
        this.deliveryRepo.markDead(delivery.id, message, res.status);
        webhookFailedTotal.inc();
      } else {
        const next = new Date(Date.now() + computeBackoffMs(delivery.attempts));
        this.deliveryRepo.rescheduleForRetry(delivery.id, message, res.status, next);
      }
    } catch (err) {
      const error = err as Error;
      if (delivery.attempts >= delivery.maxAttempts) {
        this.deliveryRepo.markDead(delivery.id, error.message, null);
        webhookFailedTotal.inc();
      } else {
        const next = new Date(Date.now() + computeBackoffMs(delivery.attempts));
        this.deliveryRepo.rescheduleForRetry(delivery.id, error.message, null, next);
      }
    }
  }
}
