#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z, type ZodRawShape } from 'zod';
import { MailApiClient, MailApiError, seg } from './client.js';

const baseUrl = process.env.MAIL_API_URL ?? 'http://localhost:3050';
const apiKey = process.env.MAIL_API_KEY;
if (!apiKey) {
  console.error('MAIL_API_KEY is required (an admin-scoped mail-api key, ideally with send too).');
  process.exit(1);
}

const client = new MailApiClient({ baseUrl, apiKey });
const server = new McpServer({ name: 'mailserver-mcp', version: '0.1.0' });

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: 'text', text }] };
}

function fail(err: unknown): ToolResult {
  if (err instanceof MailApiError) {
    return {
      content: [{ type: 'text', text: `mail-api error ${err.status}: ${err.message}` }],
      isError: true,
    };
  }
  return {
    content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
    isError: true,
  };
}

interface ToolMeta {
  title: string;
  description: string;
  readOnly?: boolean;
  destructive?: boolean;
}

function register<S extends ZodRawShape>(
  name: string,
  meta: ToolMeta,
  shape: S,
  handler: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>,
): void {
  const callback = async (args: z.infer<z.ZodObject<S>>): Promise<ToolResult> => {
    try {
      return ok(await handler(args));
    } catch (err) {
      return fail(err);
    }
  };
  server.registerTool(
    name,
    {
      title: meta.title,
      description: meta.description,
      inputSchema: shape,
      annotations: {
        title: meta.title,
        readOnlyHint: meta.readOnly ?? false,
        destructiveHint: meta.destructive ?? false,
      },
    },
    // The SDK's callback type is a conditional over the schema; our generic
    // wrapper can't express it, so cast the (already type-safe) callback.
    callback as Parameters<typeof server.registerTool>[2],
  );
}

const attachmentShape = z.object({
  filename: z.string(),
  content: z.string().describe('base64-encoded file content'),
  contentType: z.string().optional(),
});

// ---- send / jobs ----
register(
  'send_email',
  { title: 'Send email', description: 'Enqueue an outbound email via mail-api (POST /send).' },
  {
    to: z.string().describe('Recipient(s), comma-separated'),
    subject: z.string(),
    html: z.string(),
    text: z.string().optional(),
    replyTo: z.string().optional(),
    from: z.string().optional().describe('Must match an active SMTP account from-address'),
    attachments: z.array(attachmentShape).max(10).optional(),
    wait: z.boolean().optional().describe('Block until the job finishes (?wait=true)'),
  },
  ({ wait, ...body }) => client.post(`/send${wait ? '?wait=true' : ''}`, body),
);

register(
  'get_send_job',
  { title: 'Get send job', description: 'Get the status of a send job (GET /jobs/:id).', readOnly: true },
  { id: z.string() },
  ({ id }) => client.get(`/jobs/${seg(id)}`),
);

register(
  'list_send_jobs',
  { title: 'List send jobs', description: 'List recent send jobs (GET /jobs).', readOnly: true },
  {},
  () => client.get('/jobs'),
);

// ---- domains ----
register(
  'list_domains',
  { title: 'List domains', description: 'List all domains (GET /admin/api/domains).', readOnly: true },
  {},
  () => client.get('/admin/api/domains'),
);

register(
  'create_domain',
  { title: 'Create domain', description: 'Register a domain (POST /admin/api/domains).' },
  { name: z.string(), dkimSelector: z.string().optional() },
  (body) => client.post('/admin/api/domains', body),
);

register(
  'generate_dkim',
  { title: 'Generate DKIM', description: 'Generate/regenerate a DKIM key for a domain.' },
  { id: z.string(), selector: z.string().optional(), keysize: z.union([z.literal(2048), z.literal(4096)]).optional() },
  ({ id, ...body }) => client.post(`/admin/api/domains/${seg(id)}/dkim`, body),
);

register(
  'dns_check',
  { title: 'DNS check', description: 'Check SPF/DKIM/DMARC/MX/A DNS records for a domain.', readOnly: true },
  { id: z.string() },
  ({ id }) => client.get(`/admin/api/domains/${seg(id)}/dns-check`),
);

// ---- mailboxes ----
register(
  'list_mailboxes',
  { title: 'List mailboxes', description: 'List mailboxes (GET /admin/api/mailboxes).', readOnly: true },
  {},
  () => client.get('/admin/api/mailboxes'),
);

register(
  'create_mailbox',
  { title: 'Create mailbox', description: 'Create a mailbox in DMS + DB (POST /admin/api/mailboxes).' },
  { address: z.string(), password: z.string(), quotaMb: z.number().int().positive().optional() },
  (body) => client.post('/admin/api/mailboxes', body),
);

register(
  'set_mailbox_password',
  { title: 'Set mailbox password', description: 'Change a mailbox password.' },
  { id: z.string(), password: z.string() },
  ({ id, password }) => client.patch(`/admin/api/mailboxes/${seg(id)}/password`, { password }),
);

register(
  'delete_mailbox',
  { title: 'Delete mailbox', description: 'Delete a mailbox from DMS + DB.', destructive: true },
  { id: z.string() },
  ({ id }) => client.delete(`/admin/api/mailboxes/${seg(id)}`),
);

// ---- aliases ----
register(
  'list_aliases',
  { title: 'List aliases', description: 'List aliases (GET /admin/api/aliases).', readOnly: true },
  {},
  () => client.get('/admin/api/aliases'),
);

register(
  'create_alias',
  { title: 'Create alias', description: 'Create an alias in DMS + DB.' },
  { address: z.string(), target: z.string().describe('Target address(es), comma-separated') },
  (body) => client.post('/admin/api/aliases', body),
);

register(
  'delete_alias',
  { title: 'Delete alias', description: 'Delete an alias from DMS + DB.', destructive: true },
  { id: z.string() },
  ({ id }) => client.delete(`/admin/api/aliases/${seg(id)}`),
);

// ---- allow / deny lists ----
register(
  'list_access_rules',
  {
    title: 'List allow/deny rules',
    description: 'List sender/domain/IP allow- and block-list rules (GET /admin/api/access-rules).',
    readOnly: true,
  },
  {},
  () => client.get('/admin/api/access-rules'),
);

register(
  'create_access_rule',
  {
    title: 'Create allow/deny rule',
    description:
      'Add an allow/block rule for a sender email, domain, or client IP. Set recipient to scope it to one mailbox; omit for a global rule. Reflected into Postfix + Rspamd.',
  },
  {
    matchType: z.enum(['email', 'domain', 'ip']),
    action: z.enum(['allow', 'block']),
    value: z.string().describe('Email, domain, or IP/CIDR to match'),
    recipient: z.string().optional().describe('Scope to this mailbox; omit for global'),
    note: z.string().optional(),
  },
  (body) => client.post('/admin/api/access-rules', body),
);

register(
  'delete_access_rule',
  { title: 'Delete allow/deny rule', description: 'Remove an access rule.', destructive: true },
  { id: z.string() },
  ({ id }) => client.delete(`/admin/api/access-rules/${seg(id)}`),
);

// ---- smtp accounts ----
register(
  'list_smtp_accounts',
  { title: 'List SMTP accounts', description: 'List outbound SMTP accounts.', readOnly: true },
  {},
  () => client.get('/admin/api/smtp-accounts'),
);

register(
  'create_smtp_account',
  { title: 'Create SMTP account', description: 'Add an outbound SMTP account. Credentials are env-var NAMES, not values.' },
  {
    name: z.string(),
    host: z.string(),
    port: z.number().int(),
    secure: z.boolean(),
    fromAddress: z.string(),
    priority: z.number().int(),
    fromName: z.string().optional(),
    userEnvVar: z.string().optional(),
    passwordEnvVar: z.string().optional(),
    active: z.boolean().optional(),
    domainId: z.string().optional(),
  },
  (body) => client.post('/admin/api/smtp-accounts', body),
);

register(
  'delete_smtp_account',
  { title: 'Delete SMTP account', description: 'Delete an SMTP account.', destructive: true },
  { id: z.string() },
  ({ id }) => client.delete(`/admin/api/smtp-accounts/${seg(id)}`),
);

// ---- api keys ----
register(
  'list_api_keys',
  { title: 'List API keys', description: 'List API keys (no secrets).', readOnly: true },
  {},
  () => client.get('/admin/api/api-keys'),
);

register(
  'create_api_key',
  { title: 'Create API key', description: 'Create an API key; the plaintext is returned ONCE.' },
  { name: z.string(), scopes: z.array(z.string()).optional(), expiresAt: z.string().optional() },
  (body) => client.post('/admin/api/api-keys', body),
);

register(
  'revoke_api_key',
  { title: 'Revoke API key', description: 'Revoke an API key.', destructive: true },
  { id: z.string() },
  ({ id }) => client.delete(`/admin/api/api-keys/${seg(id)}`),
);

// ---- webhooks ----
register(
  'list_webhooks',
  { title: 'List webhooks', description: 'List webhook subscriptions.', readOnly: true },
  {},
  () => client.get('/admin/api/webhooks'),
);

register(
  'create_webhook',
  { title: 'Create webhook', description: 'Create a webhook subscription; the signing secret is returned ONCE.' },
  { name: z.string(), url: z.string(), events: z.array(z.string()), active: z.boolean().optional() },
  (body) => client.post('/admin/api/webhooks', body),
);

register(
  'test_webhook',
  { title: 'Test webhook', description: 'Send a test delivery to a webhook.' },
  { id: z.string() },
  ({ id }) => client.post(`/admin/api/webhooks/${seg(id)}/test`),
);

register(
  'delete_webhook',
  { title: 'Delete webhook', description: 'Delete a webhook subscription.', destructive: true },
  { id: z.string() },
  ({ id }) => client.delete(`/admin/api/webhooks/${seg(id)}`),
);

// ---- feature flags ----
register(
  'list_feature_flags',
  { title: 'List feature flags', description: 'List feature flags and their state.', readOnly: true },
  {},
  () => client.get('/admin/api/feature-flags'),
);

register(
  'set_feature_flag',
  { title: 'Set feature flag', description: 'Enable or disable a feature flag.' },
  { key: z.string(), enabled: z.boolean() },
  ({ key, enabled }) => client.patch(`/admin/api/feature-flags/${seg(key)}`, { enabled }),
);

// ---- DMS↔DB sync ----
register(
  'sync_preview',
  {
    title: 'Sync preview',
    description: 'Compute DMS↔DB divergence as reviewable items. Writes nothing.',
    readOnly: true,
  },
  {},
  () => client.get('/admin/api/sync/preview'),
);

register(
  'sync_status',
  { title: 'Sync status', description: 'Last sync run summary.', readOnly: true },
  {},
  () => client.get('/admin/api/sync/status'),
);

register(
  'sync_apply',
  {
    title: 'Sync apply',
    description:
      'Apply selected reconciliation resolutions. Use stateHash values from sync_preview. ' +
      'Deletes require confirmDeletes=true.',
    destructive: true,
  },
  {
    confirmDeletes: z.boolean().optional(),
    resolutions: z
      .array(
        z.object({
          entityType: z.enum(['domain', 'mailbox', 'alias', 'dkim']),
          key: z.string(),
          resolution: z.enum(['import', 'push', 'field_pick', 'delete_db', 'delete_dms', 'skip']),
          stateHash: z.string(),
          fields: z.record(z.enum(['dms', 'db'])).optional(),
          password: z.string().optional(),
        }),
      )
      .min(1),
  },
  (body) => client.post('/admin/api/sync/apply', body),
);

// ---- engine observability ----
register(
  'get_engine_overview',
  {
    title: 'Engine overview',
    description:
      'Rspamd/Dovecot stats, docker-mailserver feature toggles, and container status (GET /admin/api/engine/overview).',
    readOnly: true,
  },
  {},
  () => client.get('/admin/api/engine/overview'),
);

register(
  'restart_container',
  {
    title: 'Restart container',
    description: 'Restart an allow-listed mail-stack container (mailserver, nginx, mail-api).',
    destructive: true,
  },
  { name: z.string() },
  ({ name }) => client.post(`/admin/api/engine/containers/${seg(name)}/restart`),
);

// ---- operational views ----
register(
  'get_mail_logs',
  {
    title: 'Mail logs',
    description: 'Tail/search the mail log (GET /admin/api/ops/logs?lines&q).',
    readOnly: true,
  },
  {
    lines: z.number().int().min(1).max(2000).optional(),
    q: z.string().optional().describe('Case-insensitive substring filter'),
  },
  ({ lines, q }) => {
    const params = new URLSearchParams();
    if (lines) params.set('lines', String(lines));
    if (q) params.set('q', q);
    const qs = params.toString();
    return client.get(`/admin/api/ops/logs${qs ? `?${qs}` : ''}`);
  },
);

register(
  'get_mail_queue',
  {
    title: 'Mail queue',
    description: 'View the Postfix mail queue (GET /admin/api/ops/queue).',
    readOnly: true,
  },
  {},
  () => client.get('/admin/api/ops/queue'),
);

register(
  'get_sessions',
  {
    title: 'Active sessions',
    description: 'List active IMAP/POP3 sessions (GET /admin/api/ops/sessions).',
    readOnly: true,
  },
  {},
  () => client.get('/admin/api/ops/sessions'),
);

// ---- IMAP migration ----
register(
  'list_migrations',
  {
    title: 'List migrations',
    description: 'List IMAP migration jobs (GET /admin/api/migrations).',
    readOnly: true,
  },
  {},
  () => client.get('/admin/api/migrations'),
);

register(
  'get_migration',
  {
    title: 'Get migration',
    description: 'Get a migration job with its sync log (GET /admin/api/migrations/:id).',
    readOnly: true,
  },
  { id: z.string() },
  ({ id }) => client.get(`/admin/api/migrations/${seg(id)}`),
);

register(
  'create_migration',
  {
    title: 'Create migration',
    description:
      'Queue a one-shot IMAP import of an external mailbox into a local address via Dovecot dsync.',
  },
  {
    sourceHost: z.string(),
    sourcePort: z.number().int().min(1).max(65535).optional(),
    sourceUser: z.string(),
    sourcePassword: z.string(),
    sourceSsl: z.enum(['imaps', 'starttls', 'none']).optional(),
    destAddress: z.string().describe('An existing local mailbox address'),
  },
  (body) => client.post('/admin/api/migrations', body),
);

// ---- inbound fetching (fetchmail) ----
register(
  'list_fetchmail',
  {
    title: 'List fetchmail accounts',
    description: 'List inbound-fetch (fetchmail) accounts (GET /admin/api/fetchmail).',
    readOnly: true,
  },
  {},
  () => client.get('/admin/api/fetchmail'),
);

register(
  'create_fetchmail',
  {
    title: 'Create fetchmail account',
    description:
      'Add a recurring inbound-fetch account pulling a remote IMAP/POP3 mailbox into a local address. Requires ENABLE_FETCHMAIL=1 on the mailserver.',
  },
  {
    pollServer: z.string(),
    protocol: z.enum(['imap', 'pop3']),
    port: z.number().int().min(1).max(65535).optional(),
    username: z.string(),
    password: z.string(),
    destAddress: z.string().describe('An existing local mailbox address'),
    ssl: z.boolean().optional(),
    keep: z.boolean().optional(),
  },
  (body) => client.post('/admin/api/fetchmail', body),
);

register(
  'delete_fetchmail',
  {
    title: 'Delete fetchmail account',
    description: 'Remove an inbound-fetch account.',
    destructive: true,
  },
  { id: z.string() },
  ({ id }) => client.delete(`/admin/api/fetchmail/${seg(id)}`),
);

// ---- bulk import ----
register(
  'import_bulk',
  {
    title: 'Bulk import',
    description:
      'Idempotently provision domains/mailboxes/aliases from a JSON document (POST /admin/api/import). Set dryRun to preview without applying. Existing entities are skipped.',
  },
  {
    dryRun: z.boolean().optional(),
    domains: z
      .array(z.object({ name: z.string(), dkimSelector: z.string().optional() }))
      .optional(),
    mailboxes: z
      .array(
        z.object({
          address: z.string(),
          password: z.string().optional(),
          quotaMb: z.number().int().optional(),
          notes: z.string().optional(),
        }),
      )
      .optional(),
    aliases: z
      .array(z.object({ address: z.string(), target: z.string(), notes: z.string().optional() }))
      .optional(),
  },
  ({ dryRun, ...doc }) => client.post(`/admin/api/import?dryRun=${dryRun ? 'true' : 'false'}`, doc),
);

// ---- bounces / delivery feedback ----
register(
  'list_bounces',
  {
    title: 'List bounces',
    description: 'List captured delivery-status notifications (GET /admin/api/bounces).',
    readOnly: true,
  },
  {},
  () => client.get('/admin/api/bounces'),
);

register(
  'ingest_bounce',
  {
    title: 'Ingest bounce',
    description:
      'Parse a raw DSN/bounce email and record it, correlating to the send job by message id (POST /admin/api/bounces/ingest).',
  },
  { raw: z.string().describe('The raw bounce email (headers + body)') },
  ({ raw }) => client.post('/admin/api/bounces/ingest', { raw }),
);

// ---- suppression list ----
register(
  'list_suppressions',
  {
    title: 'List suppressions',
    description: 'List suppressed recipient addresses (GET /admin/api/suppressions).',
    readOnly: true,
  },
  {},
  () => client.get('/admin/api/suppressions'),
);

register(
  'add_suppression',
  {
    title: 'Add suppression',
    description: 'Suppress a recipient address so /send refuses to deliver to it.',
  },
  {
    address: z.string(),
    reason: z.enum(['hard_bounce', 'complaint', 'manual', 'unsubscribe']).optional(),
    note: z.string().optional(),
  },
  (body) => client.post('/admin/api/suppressions', body),
);

register(
  'remove_suppression',
  { title: 'Remove suppression', description: 'Remove a suppression entry.', destructive: true },
  { id: z.string() },
  ({ id }) => client.delete(`/admin/api/suppressions/${seg(id)}`),
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`mailserver-mcp connected (target: ${baseUrl})`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
