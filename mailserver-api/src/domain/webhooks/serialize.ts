import type { WebhookDTO, WebhookDeliveryDTO } from '../../contracts';
import type { WebhookDeliveryRow, WebhookRow } from '../../db/schema';

export function serializeWebhook(row: WebhookRow): WebhookDTO {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    events: row.events,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeDelivery(row: WebhookDeliveryRow): WebhookDeliveryDTO {
  return {
    id: row.id,
    webhookId: row.webhookId,
    event: row.event,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    lastResponseStatus: row.lastResponseStatus,
    lastResponseBody: row.lastResponseBody,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    nextAttemptAt: row.nextAttemptAt.toISOString(),
  };
}
