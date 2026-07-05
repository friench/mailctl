/**
 * Known feature flags. Each is the source of truth for its key, default, and
 * description. The DB only overrides the default; flags not in this registry
 * are treated as unknown and rejected by the API.
 */
export interface FlagDefinition {
  key: string;
  default: boolean;
  description: string;
}

export const FLAG_DEFINITIONS: readonly FlagDefinition[] = [
  {
    key: 'webhooks_enabled',
    default: true,
    description: 'Dispatch outbound webhook events on send/mailbox changes.',
  },
  {
    key: 'queue_enabled',
    default: true,
    description: 'Process the persistent send queue. Disabling pauses outbound mail.',
  },
  {
    key: 'webhook_worker_enabled',
    default: true,
    description: 'Process pending webhook deliveries.',
  },
  {
    key: 'auto_dkim_enabled',
    default: false,
    description: 'Auto-generate a DKIM key when a new domain is added.',
  },
  {
    key: 'backups_enabled',
    default: false,
    description:
      'Run scheduled online backups of the panel SQLite DB (with rotation + optional S3 upload). Manual backups always work regardless of this flag.',
  },
  {
    key: 'sync_preview_notify',
    default: false,
    description:
      'Periodically compute DMS↔DB divergence and notify (log + webhook) when it exists. Never auto-applies.',
  },
  {
    key: 'quarantine_retention_enabled',
    default: false,
    description:
      'Periodically expunge spam older than QUARANTINE_RETENTION_DAYS from every mailbox Junk folder.',
  },
] as const;

export const KNOWN_FLAG_KEYS = new Set(FLAG_DEFINITIONS.map((f) => f.key));

export function findDefinition(key: string): FlagDefinition | undefined {
  return FLAG_DEFINITIONS.find((f) => f.key === key);
}
