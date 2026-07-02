import { and, eq, gte, count } from 'drizzle-orm';
import type { Db } from '../../db/client';
import {
  sendJobs,
  webhookDeliveries,
  domains,
  mailboxes,
  aliases,
  smtpAccounts,
  apiKeys,
} from '../../db/schema';

export interface StatsSnapshot {
  jobs: {
    pending: number;
    processing: number;
    done: number;
    dead: number;
    last24hDone: number;
    last24hFailed: number;
  };
  webhooks: {
    pending: number;
    done: number;
    dead: number;
  };
  counts: {
    domains: number;
    mailboxes: number;
    aliases: number;
    smtpAccounts: number;
    apiKeys: number;
  };
  generatedAt: string;
}

export class StatsService {
  constructor(private readonly db: Db) {}

  snapshot(now: Date = new Date()): StatsSnapshot {
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1_000);

    const jobStatus = (status: 'pending' | 'processing' | 'done' | 'dead') =>
      this.db.select({ n: count() }).from(sendJobs).where(eq(sendJobs.status, status)).get()?.n ??
      0;

    const jobsLast24h = (status: 'done' | 'dead') =>
      this.db
        .select({ n: count() })
        .from(sendJobs)
        .where(and(eq(sendJobs.status, status), gte(sendJobs.completedAt, since)))
        .get()?.n ?? 0;

    const webhookStatus = (status: 'pending' | 'done' | 'dead') =>
      this.db
        .select({ n: count() })
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.status, status))
        .get()?.n ?? 0;

    return {
      jobs: {
        pending: jobStatus('pending'),
        processing: jobStatus('processing'),
        done: jobStatus('done'),
        dead: jobStatus('dead'),
        last24hDone: jobsLast24h('done'),
        last24hFailed: jobsLast24h('dead'),
      },
      webhooks: {
        pending: webhookStatus('pending'),
        done: webhookStatus('done'),
        dead: webhookStatus('dead'),
      },
      counts: {
        domains: this.db.select({ n: count() }).from(domains).get()?.n ?? 0,
        mailboxes: this.db.select({ n: count() }).from(mailboxes).get()?.n ?? 0,
        aliases: this.db.select({ n: count() }).from(aliases).get()?.n ?? 0,
        smtpAccounts: this.db.select({ n: count() }).from(smtpAccounts).get()?.n ?? 0,
        apiKeys: this.db.select({ n: count() }).from(apiKeys).get()?.n ?? 0,
      },
      generatedAt: now.toISOString(),
    };
  }
}
