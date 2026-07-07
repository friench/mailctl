import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core';

/** Origin of a domain/mailbox/alias row: created in the panel, or imported from DMS. */
export const SOURCES = ['panel', 'dms'] as const;
export type Source = (typeof SOURCES)[number];

/** RBAC roles. Global: admin / read_only. Domain-scoped: domain_admin / domain_read_only.
 *  domain_user is an end-user (self-service, own mailbox). */
export const USER_ROLES = [
  'admin',
  'read_only',
  'domain_admin',
  'domain_read_only',
  'domain_user',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

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
    /** Per-key send policy: when true, `/send` bypasses the suppression list. */
    suppressionExempt: integer('suppression_exempt', { mode: 'boolean' }).notNull().default(false),
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

export const MIN_TLS_VERSIONS = ['TLSv1.2', 'TLSv1.3'] as const;
export type MinTlsVersion = (typeof MIN_TLS_VERSIONS)[number];

export const smtpAccounts = sqliteTable(
  'smtp_accounts',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    host: text('host').notNull(),
    port: integer('port').notNull(),
    secure: integer('secure', { mode: 'boolean' }).notNull(),
    // Per-account TLS policy. `requireTls` forces STARTTLS; `rejectUnauthorized`
    // overrides the global cert-verification default (null = inherit);
    // `minTlsVersion` pins a floor (null = library default).
    requireTls: integer('require_tls', { mode: 'boolean' }).notNull().default(false),
    rejectUnauthorized: integer('reject_unauthorized', { mode: 'boolean' }),
    minTlsVersion: text('min_tls_version', { enum: MIN_TLS_VERSIONS }),
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
    sendBlocked: integer('send_blocked', { mode: 'boolean' }).notNull().default(false),
    receiveBlocked: integer('receive_blocked', { mode: 'boolean' }).notNull().default(false),
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
    expiresAt: integer('expires_at', { mode: 'timestamp' }),
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

/** A single incoming-mail filter rule (compiled into Sieve). */
export interface SieveRule {
  field: 'from' | 'to' | 'subject';
  contains: string;
  action: 'fileinto' | 'redirect' | 'discard';
  /** Destination folder (fileinto) or address (redirect); unused for discard. */
  arg?: string;
}

/** Per-mailbox Sieve config: a vacation autoresponder + filter rules. */
export const mailboxSieve = sqliteTable('mailbox_sieve', {
  mailboxId: text('mailbox_id')
    .primaryKey()
    .references(() => mailboxes.id, { onDelete: 'cascade' }),
  vacationEnabled: integer('vacation_enabled', { mode: 'boolean' }).notNull().default(false),
  vacationSubject: text('vacation_subject'),
  vacationMessage: text('vacation_message'),
  vacationDays: integer('vacation_days').notNull().default(7),
  rules: text('rules', { mode: 'json' }).$type<SieveRule[]>().notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type MailboxSieveRow = typeof mailboxSieve.$inferSelect;

/** Allow/deny list rule match kinds and actions. */
export const ACCESS_MATCH_TYPES = ['email', 'domain', 'ip'] as const;
export type AccessMatchType = (typeof ACCESS_MATCH_TYPES)[number];
export const ACCESS_ACTIONS = ['allow', 'block'] as const;
export type AccessAction = (typeof ACCESS_ACTIONS)[number];

/**
 * A sender/domain/IP allow- or block-list entry. `recipient` scopes the rule to
 * one mailbox (per-recipient override); NULL means it applies globally.
 */
export const accessRules = sqliteTable(
  'access_rules',
  {
    id: text('id').primaryKey(),
    matchType: text('match_type', { enum: ACCESS_MATCH_TYPES }).notNull(),
    action: text('action', { enum: ACCESS_ACTIONS }).notNull(),
    value: text('value').notNull(),
    recipient: text('recipient'),
    note: text('note'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    lookupIdx: index('access_rules_lookup_idx').on(table.matchType, table.value),
  }),
);

export type AccessRuleRow = typeof accessRules.$inferSelect;
export type AccessRuleInsert = typeof accessRules.$inferInsert;

export const SUPPRESSION_REASONS = ['hard_bounce', 'complaint', 'manual', 'unsubscribe'] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

/**
 * A recipient address the sender should not deliver to (hard bounce, complaint,
 * or a manual/unsubscribe entry). Enforced on `POST /send` unless the API key is
 * suppression-exempt.
 */
export const suppressions = sqliteTable('suppressions', {
  id: text('id').primaryKey(),
  address: text('address').notNull().unique(),
  reason: text('reason', { enum: SUPPRESSION_REASONS }).notNull().default('manual'),
  /** Provenance, e.g. a bounce event id or `manual`. */
  source: text('source'),
  note: text('note'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export type SuppressionRow = typeof suppressions.$inferSelect;

export const BOUNCE_TYPES = ['bounce', 'complaint'] as const;
export type BounceType = (typeof BOUNCE_TYPES)[number];
export const BOUNCE_CLASSIFICATIONS = ['hard', 'soft', 'unknown'] as const;
export type BounceClassificationType = (typeof BOUNCE_CLASSIFICATIONS)[number];

/**
 * A captured delivery-status notification (bounce) for one recipient, correlated
 * to the originating send job by the message id when possible.
 */
export const bounceEvents = sqliteTable(
  'bounce_events',
  {
    id: text('id').primaryKey(),
    sendJobId: text('send_job_id').references(() => sendJobs.id, { onDelete: 'set null' }),
    recipient: text('recipient').notNull(),
    type: text('type', { enum: BOUNCE_TYPES }).notNull().default('bounce'),
    classification: text('classification', { enum: BOUNCE_CLASSIFICATIONS })
      .notNull()
      .default('unknown'),
    statusCode: text('status_code'),
    diagnostic: text('diagnostic'),
    originalMessageId: text('original_message_id'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    recipientIdx: index('bounce_events_recipient_idx').on(table.recipient),
    sendJobIdIdx: index('bounce_events_send_job_id_idx').on(table.sendJobId),
  }),
);

export type BounceEventRow = typeof bounceEvents.$inferSelect;

export const FETCHMAIL_PROTOCOLS = ['imap', 'pop3'] as const;
export type FetchmailProtocol = (typeof FETCHMAIL_PROTOCOLS)[number];

/**
 * A recurring inbound-fetch account (fetchmail): pull mail from a remote
 * IMAP/POP3 server into a local address. `passwordEnc` is encrypted at rest
 * (SecretBox) and decrypted only when rendering `fetchmail.cf`.
 */
export const fetchmailAccounts = sqliteTable('fetchmail_accounts', {
  id: text('id').primaryKey(),
  pollServer: text('poll_server').notNull(),
  protocol: text('protocol', { enum: FETCHMAIL_PROTOCOLS }).notNull(),
  port: integer('port'),
  username: text('username').notNull(),
  passwordEnc: text('password_enc').notNull(),
  destAddress: text('dest_address').notNull(),
  ssl: integer('ssl', { mode: 'boolean' }).notNull().default(true),
  keep: integer('keep', { mode: 'boolean' }).notNull().default(true),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export type FetchmailAccountRow = typeof fetchmailAccounts.$inferSelect;

export const MIGRATION_STATUSES = ['pending', 'processing', 'done', 'failed'] as const;
export type MigrationStatus = (typeof MIGRATION_STATUSES)[number];
export const IMAP_SSL_MODES = ['imaps', 'starttls', 'none'] as const;
export type ImapSslMode = (typeof IMAP_SSL_MODES)[number];

/**
 * A one-shot IMAP import job: pull a remote mailbox into a local address via
 * Dovecot dsync. `sourcePasswordEnc` holds the source password encrypted at rest
 * (SecretBox); it is wiped once the job reaches a terminal state.
 */
export const migrationJobs = sqliteTable(
  'migration_jobs',
  {
    id: text('id').primaryKey(),
    sourceHost: text('source_host').notNull(),
    sourcePort: integer('source_port').notNull(),
    sourceUser: text('source_user').notNull(),
    sourceSsl: text('source_ssl', { enum: IMAP_SSL_MODES }).notNull(),
    sourcePasswordEnc: text('source_password_enc'),
    destAddress: text('dest_address').notNull(),
    status: text('status', { enum: MIGRATION_STATUSES }).notNull().default('pending'),
    log: text('log'),
    error: text('error'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    startedAt: integer('started_at', { mode: 'timestamp' }),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
  },
  (table) => ({
    statusIdx: index('migration_jobs_status_idx').on(table.status),
  }),
);

export type MigrationJobRow = typeof migrationJobs.$inferSelect;

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
  role: text('role', { enum: USER_ROLES }).notNull().default('admin'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
});

/** Domains a domain-scoped user (domain_admin / domain_read_only) may manage. */
export const userDomains = sqliteTable(
  'user_domains',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    domainId: text('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.domainId] }),
    userIdIdx: index('user_domains_user_id_idx').on(table.userId),
  }),
);

export type UserRow = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;

export const WEBHOOK_EVENTS = [
  'send.completed',
  'send.failed',
  'send.bounced',
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
