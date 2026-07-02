import { Registry, Counter, collectDefaultMetrics } from 'prom-client';

/** Prometheus registry for all mail-api metrics. */
export const register = new Registry();

collectDefaultMetrics({ register, prefix: 'mailapi_' });

export const sendCompletedTotal = new Counter({
  name: 'mailapi_send_completed_total',
  help: 'Total send jobs marked done',
  registers: [register],
});

export const sendFailedTotal = new Counter({
  name: 'mailapi_send_failed_total',
  help: 'Total send jobs dead-lettered',
  registers: [register],
});

export const webhookDeliveredTotal = new Counter({
  name: 'mailapi_webhook_delivered_total',
  help: 'Total webhook deliveries succeeded',
  registers: [register],
});

export const webhookFailedTotal = new Counter({
  name: 'mailapi_webhook_failed_total',
  help: 'Total webhook deliveries dead-lettered',
  registers: [register],
});
