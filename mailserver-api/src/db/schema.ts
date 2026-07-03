import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

/** Origin of a domain/mailbox/alias row: created in the panel, or imported from DMS. */
export const SOURCES = ['panel', 'dms'] as const;
export type Source = (typeof SOURCES)[number];

// Drizzle schema. Tables added per phase:
//   Phase 2: api_keys
//   Phase 3: domains, smtp_accounts
//   Phase 4: mailboxes
//   Phase 5: send_jobs
//   Phase 6: users (sessions are stateless, in cookie)
//   Phase 7: webhooks, webhook_deliveries
//   Phase 9: feature_flags                         ← here

export const apiKeys = sqliteTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    hash: text('hash').notNull(),
    prefix: text('prefix').notNull().unique(),
    scopes: text('scopes', { mode: 'json' }).$type<string[]>().notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
    revokedAt: integer('revoked_at', { mode: 'timestamp' }),
    createdByUserId: text('created_by_user_id'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    prefixIdx: index('api_keys_prefix_idx').on(table.prefix),
  }),
);

export const domains = sqliteTable('domains', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  dkimSelector: text('dkim_selector'),
  dkimPublicKey: text('dkim_public_key'),
  dkimStatus: text('dkim_status'),
  source: text('source', { enum: SOURCES }).notNull().default('panel'),
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const smtpAccounts = sqliteTable(
  'smtp_accounts',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    host: text('host').notNull(),
    port: integer('port').notNull(),
    secure: integer('secure', { mode: 'boolean' }).notNull(),
    userEnvVar: text('user_env_var'),
    passwordEnvVar: text('password_env_var'),
    fromAddress: text('from_address').notNull(),
    fromName: text('from_name'),
    priority: integer('priority').notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    domainId: text('domain_id').references(() => domains.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    activePriorityIdx: index('smtp_accounts_active_priority_idx').on(table.active, table.priority),
    domainIdIdx: index('smtp_accounts_domain_id_idx').on(table.domainId),
  }),
);

export const mailboxes = sqliteTable(
  'mailboxes',
  {
    id: text('id').primaryKey(),
    address: text('address').notNull().unique(),
    domainId: text('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),
    quotaMb: integer('quota_mb'),
    source: text('source', { enum: SOURCES }).notNull().default('panel'),
    externallyManaged: integer('externally_managed', { mode: 'boolean' }).notNull().default(false),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    notes: text('notes'),
    lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    domainIdIdx: index('mailboxes_domain_id_idx').on(table.domainId),
  }),
);

export const aliases = sqliteTable(
  'aliases',
  {
    id: text('id').primaryKey(),
    address: text('address').notNull().unique(),
    target: text('target').notNull(),
    domainId: text('domain_id').references(() => domains.id, { onDelete: 'set null' }),
    source: text('source', { enum: SOURCES }).notNull().default('panel'),
    notes: text('notes'),
    lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    addressIdx: index('aliases_address_idx').on(table.address),
    domainIdIdx: index('aliases_domain_id_idx').on(table.domainId),
  }),
);

export type AliasRow = typeof aliases.$inferSelect;
export type AliasInsert = typeof aliases.$inferInsert;

export interface SendJobPayload {
  to: string;
  subject: string;
  html: string;
  from?: string;
  text?: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: string; contentType?: string }>;
}

export const SEND_JOB_STATUSES = ['pending', 'processing', 'done', 'dead'] as const;
export type SendJobStatus = (typeof SEND_JOB_STATUSES)[number];

export const sendJobs = sqliteTable(
  'send_jobs',
  {
    id: text('id').primaryKey(),
    payload: text('payload', { mode: 'json' }).$type<SendJobPayload>().notNull(),
    status: text('status', { enum: SEND_JOB_STATUSES }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    nextAttemptAt: integer('next_attempt_at', { mode: 'timestamp' }).notNull(),
    lastError: text('last_error'),
    accountUsed: text('account_used'),
    messageId: text('message_id'),
    apiKeyId: text('api_key_id').references(() => apiKeys.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    startedAt: integer('started_at', { mode: 'timestamp' }),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
  },
  (table) => ({
    pendingReadyIdx: index('send_jobs_pending_ready_idx').on(table.status, table.nextAttemptAt),
    apiKeyIdIdx: index('send_jobs_api_key_id_idx').on(table.apiKeyId),
    statusCompletedIdx: index('send_jobs_status_completed_idx').on(table.status, table.completedAt),
  }),
);

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
});

export type UserRow = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;

export const WEBHOOK_EVENTS = [
  'send.completed',
  'send.failed',
  'mailbox.created',
  'mailbox.deleted',
  'webhook.test',
  'sync.divergence_detected',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_DELIVERY_STATUSES = ['pending', 'processing', 'done', 'dead'] as const;
export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];

export const webhooks = sqliteTable('webhooks', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  secret: text('secret').notNull(),
  events: text('events', { mode: 'json' }).$type<string[]>().notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const webhookDeliveries = sqliteTable(
  'webhook_deliveries',
  {
    id: text('id').primaryKey(),
    webhookId: text('webhook_id').references(() => webhooks.id, { onDelete: 'set null' }),
    event: text('event').notNull(),
    payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    status: text('status', { enum: WEBHOOK_DELIVERY_STATUSES }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    nextAttemptAt: integer('next_attempt_at', { mode: 'timestamp' }).notNull(),
    lastResponseStatus: integer('last_response_status'),
    lastResponseBody: text('last_response_body'),
    lastError: text('last_error'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    startedAt: integer('started_at', { mode: 'timestamp' }),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
  },
  (table) => ({
    pendingReadyIdx: index('webhook_deliveries_pending_ready_idx').on(
      table.status,
      table.nextAttemptAt,
    ),
    webhookIdIdx: index('webhook_deliveries_webhook_id_idx').on(table.webhookId),
    statusCompletedIdx: index('webhook_deliveries_status_completed_idx').on(
      table.status,
      table.completedAt,
    ),
  }),
);

export type WebhookRow = typeof webhooks.$inferSelect;
export type WebhookInsert = typeof webhooks.$inferInsert;
export type WebhookDeliveryRow = typeof webhookDeliveries.$inferSelect;
export type WebhookDeliveryInsert = typeof webhookDeliveries.$inferInsert;

export const featureFlags = sqliteTable('feature_flags', {
  key: text('key').primaryKey(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type FeatureFlagRow = typeof featureFlags.$inferSelect;
export type FeatureFlagInsert = typeof featureFlags.$inferInsert;

export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type ApiKeyInsert = typeof apiKeys.$inferInsert;
export type DomainRow = typeof domains.$inferSelect;
export type DomainInsert = typeof domains.$inferInsert;
export type SmtpAccountRow = typeof smtpAccounts.$inferSelect;
export type SmtpAccountInsert = typeof smtpAccounts.$inferInsert;
export type MailboxRow = typeof mailboxes.$inferSelect;
export type MailboxInsert = typeof mailboxes.$inferInsert;
export type SendJobRow = typeof sendJobs.$inferSelect;
export type SendJobInsert = typeof sendJobs.$inferInsert;
