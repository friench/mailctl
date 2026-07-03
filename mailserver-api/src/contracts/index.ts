/**
 * Shared API response contracts — the SINGLE SOURCE OF TRUTH for the shapes
 * returned by the mail-api HTTP endpoints.
 *
 * This module MUST stay dependency-free: it declares plain TypeScript
 * `interface` / `type` shapes only (primitives, string/number/boolean/null,
 * arrays, nested objects). Timestamps are serialized as ISO strings, or
 * `string | null` when the underlying column is nullable.
 *
 * It is imported (type-only) by both the backend serializers — which are
 * annotated with these types so drift becomes a compile error — and, later,
 * by the UI, giving both sides one import site.
 *
 * The ONLY permitted import is the type-only re-export of the DMS↔DB sync
 * shapes below, which live in a module that is itself dependency-free.
 */

// ── shared literal unions (mirrored from the DB schema; kept inline so this
//    module imports nothing) ────────────────────────────────────────────────

/** Origin of a domain/mailbox/alias row. */
export type Source = 'panel' | 'dms';

/** Lifecycle status of a send job. */
export type SendJobStatus = 'pending' | 'processing' | 'done' | 'dead';

/** Lifecycle status of a webhook delivery. */
export type WebhookDeliveryStatus = 'pending' | 'processing' | 'done' | 'dead';

// ── domains ──────────────────────────────────────────────────────────────────

export interface DomainDTO {
  id: string;
  name: string;
  dkimSelector: string | null;
  dkimPublicKey: string | null;
  active: boolean;
  source: Source;
  dkimStatus: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
}

// ── mailboxes ────────────────────────────────────────────────────────────────

export interface MailboxDTO {
  id: string;
  address: string;
  domainId: string;
  quotaMb: number | null;
  active: boolean;
  source: Source;
  externallyManaged: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
}

// ── aliases ──────────────────────────────────────────────────────────────────

export interface AliasDTO {
  id: string;
  address: string;
  target: string;
  domainId: string | null;
  source: Source;
  lastSyncedAt: string | null;
  createdAt: string;
}

// ── smtp accounts ────────────────────────────────────────────────────────────

export interface SmtpAccountDTO {
  id: string;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  userEnvVar: string | null;
  passwordEnvVar: string | null;
  fromAddress: string;
  fromName: string | null;
  priority: number;
  active: boolean;
  domainId: string | null;
  createdAt: string;
}

// ── api keys ─────────────────────────────────────────────────────────────────

export interface ApiKeyDTO {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** Returned ONCE on creation — carries the plaintext key (`plain`). */
export interface CreatedApiKeyDTO {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  expiresAt: string | null;
  plain: string;
}

// ── webhooks ─────────────────────────────────────────────────────────────────

export interface WebhookDTO {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

/** Returned ONCE on creation — carries the plaintext signing `secret`. */
export interface CreatedWebhookDTO {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
  secret: string;
}

export interface WebhookDeliveryDTO {
  id: string;
  webhookId: string | null;
  event: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  maxAttempts: number;
  lastResponseStatus: number | null;
  lastResponseBody: string | null;
  lastError: string | null;
  createdAt: string;
  completedAt: string | null;
  nextAttemptAt: string;
}

// ── users ────────────────────────────────────────────────────────────────────

export interface UserDTO {
  id: string;
  email: string;
  createdAt: string;
  lastLoginAt: string | null;
}

// ── feature flags ────────────────────────────────────────────────────────────

export interface FeatureFlagDTO {
  key: string;
  enabled: boolean;
  default: boolean;
  description: string;
  override: boolean;
  updatedAt: string | null;
}

// ── send jobs ────────────────────────────────────────────────────────────────

/** Payload of a queued send job (mirrors the stored JSON column shape). */
export interface SendJobPayloadDTO {
  to: string;
  subject: string;
  html: string;
  from?: string;
  text?: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: string; contentType?: string }>;
}

/** Full send-job DTO used by the /jobs endpoints. */
export interface SendJobDTO {
  id: string;
  status: SendJobStatus;
  attempts: number;
  maxAttempts: number;
  payload: SendJobPayloadDTO;
  account: string | null;
  messageId: string | null;
  error: string | null;
  apiKeyId: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  nextAttemptAt: string;
}

/** Trimmed send-job DTO returned inline by the /send endpoint. */
export interface SendJobSummaryDTO {
  id: string;
  status: SendJobStatus;
  attempts: number;
  maxAttempts: number;
  account: string | null;
  messageId: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

// ── stats ────────────────────────────────────────────────────────────────────

export interface StatsSnapshotDTO {
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

// ── backups ──────────────────────────────────────────────────────────────────

export interface BackupItemDTO {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

export interface BackupsResponseDTO {
  s3Configured: boolean;
  config: {
    enabled: boolean;
    intervalHours: number;
    keep: number;
    dir: string;
  };
  items: BackupItemDTO[];
}

// ── health ───────────────────────────────────────────────────────────────────

export interface HealthDTO {
  status: string;
  uptime: number;
  accounts: number;
}

// ── DNS check ────────────────────────────────────────────────────────────────

export interface DnsRecordDTO {
  type:
    | 'A'
    | 'AAAA'
    | 'MX'
    | 'SPF'
    | 'DKIM'
    | 'DMARC'
    | 'PTR'
    | 'MTA-STS'
    | 'TLS-RPT'
    | 'AUTODISCOVER';
  hostname: string;
  status: 'ok' | 'missing' | 'mismatch' | 'error';
  expected?: string;
  actual: string[];
  message?: string;
}

export interface DnsCheckDTO {
  domain: string;
  checkedAt: string;
  cached: boolean;
  records: DnsRecordDTO[];
}

// ── DMS ↔ DB sync ────────────────────────────────────────────────────────────
// Re-exported (type-only) from the sync module, which is itself dependency-free,
// so the UI has a single import site for these shapes.
export type {
  ReconciliationItem,
  ResolutionRequest,
  ApplyItemResult,
  SyncRunSummary,
  EntityType,
  Divergence,
  Resolution,
} from '../domain/sync/types';
