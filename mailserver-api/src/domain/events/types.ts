import type { WebhookEvent } from '../../db/schema';

/**
 * Loose contract for fanning out domain events. WebhookService implements it;
 * tests can stub. Other future sinks (e.g. Slack notifier) would also implement.
 *
 * `event` is typed as WebhookEvent so a dispatch of an event that has no matching
 * entry in WEBHOOK_EVENTS (and can therefore never be subscribed to) fails to compile.
 */
export interface EventDispatcher {
  dispatch(event: WebhookEvent, payload: Record<string, unknown>): void;
}

export const NOOP_DISPATCHER: EventDispatcher = {
  dispatch: () => undefined,
};
