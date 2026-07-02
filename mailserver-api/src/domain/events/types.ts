/**
 * Loose contract for fanning out domain events. WebhookService implements it;
 * tests can stub. Other future sinks (e.g. Slack notifier) would also implement.
 */
export interface EventDispatcher {
  dispatch(event: string, payload: Record<string, unknown>): void;
}

export const NOOP_DISPATCHER: EventDispatcher = {
  dispatch: () => undefined,
};
