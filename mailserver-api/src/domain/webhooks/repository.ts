import { and, eq, like, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from '../../db/client';
import { webhooks, type WebhookRow } from '../../db/schema';

export interface CreateWebhookInput {
  name: string;
  url: string;
  secret: string;
  events: string[];
  active?: boolean;
}

export interface UpdateWebhookInput {
  name?: string;
  url?: string;
  events?: string[];
  active?: boolean;
}

export class WebhookRepository {
  constructor(private readonly db: Db) {}

  create(input: CreateWebhookInput): WebhookRow {
    const row: WebhookRow = {
      id: randomUUID(),
      name: input.name,
      url: input.url,
      secret: input.secret,
      events: input.events,
      active: input.active ?? true,
      createdAt: new Date(),
    };
    this.db.insert(webhooks).values(row).run();
    return row;
  }

  findById(id: string): WebhookRow | undefined {
    return this.db.select().from(webhooks).where(eq(webhooks.id, id)).get();
  }

  list(): WebhookRow[] {
    return this.db.select().from(webhooks).all();
  }

  /** Returns active webhooks whose events JSON array includes `event`. */
  findActiveByEvent(event: string): WebhookRow[] {
    // SQLite JSON: events is stored as JSON text. Use LIKE on the string for portability.
    // The events array JSON looks like: ["send.completed","send.failed"]
    const needle = `%"${event}"%`;
    return this.db
      .select()
      .from(webhooks)
      .where(
        and(
          eq(webhooks.active, true),
          or(like(webhooks.events, needle), eq(webhooks.events, sql`json_array(${event})`)),
        ),
      )
      .all();
  }

  update(id: string, input: UpdateWebhookInput): WebhookRow | undefined {
    if (Object.keys(input).length === 0) return this.findById(id);
    this.db.update(webhooks).set(input).where(eq(webhooks.id, id)).run();
    return this.findById(id);
  }

  delete(id: string): boolean {
    const info = this.db.delete(webhooks).where(eq(webhooks.id, id)).run();
    return info.changes > 0;
  }
}
