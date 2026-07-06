import { z, type ZodType } from 'zod';
import { sendBodySchema } from '../http/validators/send';
import { loginSchema } from '../http/validators/auth';
import { createDomainSchema } from '../http/validators/domains';
import { createMailboxSchema } from '../http/validators/mailboxes';
import { createAliasSchema } from '../http/validators/aliases';
import { createApiKeySchema, updateApiKeySchema } from '../http/validators/apikeys';
import { createSuppressionSchema } from '../http/validators/suppressions';
import { createAccessRuleSchema } from '../http/validators/access-lists';
import { createFetchmailSchema } from '../http/validators/fetchmail';
import { createMigrationSchema } from '../http/validators/migrations';
import { createSmtpAccountSchema } from '../http/validators/smtp-accounts';
import { createWebhookSchema } from '../http/validators/webhooks';
import { importDocumentSchema } from '../http/validators/import';

type HttpMethod = 'get' | 'post' | 'patch' | 'delete';
type Security = 'apiKey' | 'admin' | 'none';

interface RouteDef {
  method: HttpMethod;
  path: string;
  tag: string;
  summary: string;
  security: Security;
  request?: ZodType;
  /** Path parameter names (e.g. ['id']). */
  params?: string[];
  /** Success response description. */
  success?: { status: number; description: string };
}

/**
 * The API surface described in the spec. Kept compact: request bodies reference
 * the real zod validators (so the spec can't drift from validation), responses
 * are described at a high level. `admin` endpoints accept either an admin
 * `X-Api-Key` or the dashboard session cookie.
 */
const ROUTES: RouteDef[] = [
  // Public sending API (API key).
  {
    method: 'post',
    path: '/send',
    tag: 'Send',
    summary: 'Enqueue an outbound email',
    security: 'apiKey',
    request: sendBodySchema,
    success: { status: 202, description: 'Job accepted (or 200 with ?wait=true)' },
  },
  {
    method: 'get',
    path: '/jobs',
    tag: 'Send',
    summary: 'List recent send jobs',
    security: 'apiKey',
  },
  {
    method: 'get',
    path: '/jobs/{id}',
    tag: 'Send',
    summary: 'Get a send job',
    security: 'apiKey',
    params: ['id'],
  },
  {
    method: 'get',
    path: '/health',
    tag: 'System',
    summary: 'Liveness + basic status',
    security: 'none',
  },
  {
    method: 'get',
    path: '/openapi.json',
    tag: 'System',
    summary: 'This OpenAPI document',
    security: 'none',
  },

  // Auth.
  {
    method: 'post',
    path: '/admin/auth/login',
    tag: 'Auth',
    summary: 'Password login (sets session cookie)',
    security: 'none',
    request: loginSchema,
  },
  {
    method: 'post',
    path: '/admin/auth/logout',
    tag: 'Auth',
    summary: 'Destroy the session',
    security: 'admin',
  },
  {
    method: 'get',
    path: '/admin/auth/me',
    tag: 'Auth',
    summary: 'Current session user',
    security: 'admin',
  },
  {
    method: 'get',
    path: '/admin/auth/config',
    tag: 'Auth',
    summary: 'Available login methods (public)',
    security: 'none',
  },

  // Admin resources.
  {
    method: 'get',
    path: '/admin/api/domains',
    tag: 'Domains',
    summary: 'List domains',
    security: 'admin',
  },
  {
    method: 'post',
    path: '/admin/api/domains',
    tag: 'Domains',
    summary: 'Create a domain',
    security: 'admin',
    request: createDomainSchema,
    success: { status: 201, description: 'Created' },
  },
  {
    method: 'get',
    path: '/admin/api/mailboxes',
    tag: 'Mailboxes',
    summary: 'List mailboxes',
    security: 'admin',
  },
  {
    method: 'post',
    path: '/admin/api/mailboxes',
    tag: 'Mailboxes',
    summary: 'Create a mailbox',
    security: 'admin',
    request: createMailboxSchema,
    success: { status: 201, description: 'Created' },
  },
  {
    method: 'get',
    path: '/admin/api/aliases',
    tag: 'Aliases',
    summary: 'List aliases',
    security: 'admin',
  },
  {
    method: 'post',
    path: '/admin/api/aliases',
    tag: 'Aliases',
    summary: 'Create an alias',
    security: 'admin',
    request: createAliasSchema,
    success: { status: 201, description: 'Created' },
  },
  {
    method: 'get',
    path: '/admin/api/suppressions',
    tag: 'Suppressions',
    summary: 'List suppressed recipients',
    security: 'admin',
  },
  {
    method: 'post',
    path: '/admin/api/suppressions',
    tag: 'Suppressions',
    summary: 'Suppress a recipient',
    security: 'admin',
    request: createSuppressionSchema,
    success: { status: 201, description: 'Created' },
  },
  {
    method: 'delete',
    path: '/admin/api/suppressions/{id}',
    tag: 'Suppressions',
    summary: 'Remove a suppression',
    security: 'admin',
    params: ['id'],
    success: { status: 204, description: 'Removed' },
  },
  {
    method: 'get',
    path: '/admin/api/bounces',
    tag: 'Bounces',
    summary: 'List captured bounces',
    security: 'admin',
  },
  {
    method: 'post',
    path: '/admin/api/bounces/ingest',
    tag: 'Bounces',
    summary: 'Ingest a raw DSN email',
    security: 'admin',
    success: { status: 201, description: 'Recorded' },
  },
  {
    method: 'get',
    path: '/admin/api/api-keys',
    tag: 'API keys',
    summary: 'List API keys',
    security: 'admin',
  },
  {
    method: 'post',
    path: '/admin/api/api-keys',
    tag: 'API keys',
    summary: 'Create an API key (plaintext shown once)',
    security: 'admin',
    request: createApiKeySchema,
    success: { status: 201, description: 'Created' },
  },
  {
    method: 'patch',
    path: '/admin/api/api-keys/{id}',
    tag: 'API keys',
    summary: 'Update a key send policy',
    security: 'admin',
    params: ['id'],
    request: updateApiKeySchema,
  },
  {
    method: 'delete',
    path: '/admin/api/api-keys/{id}',
    tag: 'API keys',
    summary: 'Revoke a key',
    security: 'admin',
    params: ['id'],
    success: { status: 204, description: 'Revoked' },
  },
  {
    method: 'post',
    path: '/admin/api/import',
    tag: 'Provisioning',
    summary: 'Idempotent bulk import (?dryRun)',
    security: 'admin',
    request: importDocumentSchema,
  },
  {
    method: 'get',
    path: '/admin/api/access-rules',
    tag: 'Access lists',
    summary: 'List allow/deny rules',
    security: 'admin',
  },
  {
    method: 'post',
    path: '/admin/api/access-rules',
    tag: 'Access lists',
    summary: 'Add an allow/deny rule',
    security: 'admin',
    request: createAccessRuleSchema,
    success: { status: 201, description: 'Created' },
  },
  {
    method: 'get',
    path: '/admin/api/fetchmail',
    tag: 'Fetchmail',
    summary: 'List fetch accounts',
    security: 'admin',
  },
  {
    method: 'post',
    path: '/admin/api/fetchmail',
    tag: 'Fetchmail',
    summary: 'Add a fetch account',
    security: 'admin',
    request: createFetchmailSchema,
    success: { status: 201, description: 'Created' },
  },
  {
    method: 'get',
    path: '/admin/api/migrations',
    tag: 'Migrations',
    summary: 'List IMAP migrations',
    security: 'admin',
  },
  {
    method: 'post',
    path: '/admin/api/migrations',
    tag: 'Migrations',
    summary: 'Queue an IMAP migration',
    security: 'admin',
    request: createMigrationSchema,
    success: { status: 201, description: 'Queued' },
  },
  {
    method: 'get',
    path: '/admin/api/smtp-accounts',
    tag: 'SMTP accounts',
    summary: 'List SMTP accounts',
    security: 'admin',
  },
  {
    method: 'post',
    path: '/admin/api/smtp-accounts',
    tag: 'SMTP accounts',
    summary: 'Add an SMTP account',
    security: 'admin',
    request: createSmtpAccountSchema,
    success: { status: 201, description: 'Created' },
  },
  {
    method: 'get',
    path: '/admin/api/webhooks',
    tag: 'Webhooks',
    summary: 'List webhooks',
    security: 'admin',
  },
  {
    method: 'post',
    path: '/admin/api/webhooks',
    tag: 'Webhooks',
    summary: 'Create a webhook (secret shown once)',
    security: 'admin',
    request: createWebhookSchema,
    success: { status: 201, description: 'Created' },
  },
  {
    method: 'get',
    path: '/admin/api/engine/overview',
    tag: 'Observability',
    summary: 'Rspamd/Dovecot/containers overview',
    security: 'admin',
  },
  {
    method: 'get',
    path: '/admin/api/ops/logs',
    tag: 'Observability',
    summary: 'Tail/search the mail log',
    security: 'admin',
  },
  {
    method: 'get',
    path: '/admin/api/ops/queue',
    tag: 'Observability',
    summary: 'Postfix mail queue',
    security: 'admin',
  },
  {
    method: 'get',
    path: '/admin/api/ops/sessions',
    tag: 'Observability',
    summary: 'Active IMAP/POP3 sessions',
    security: 'admin',
  },
  {
    method: 'get',
    path: '/admin/api/stats',
    tag: 'Observability',
    summary: 'Dashboard counters',
    security: 'admin',
  },
];

function toJsonSchema(schema: ZodType): Record<string, unknown> {
  // `unrepresentable: 'any'` tolerates .refine()/.transform() (emitted as {}).
  const js = z.toJSONSchema(schema, { unrepresentable: 'any', io: 'input' }) as Record<
    string,
    unknown
  >;
  delete js.$schema; // not allowed inside an OpenAPI media-type schema object
  return js;
}

const SECURITY_REQUIREMENT: Record<Security, Array<Record<string, string[]>>> = {
  apiKey: [{ ApiKeyAuth: [] }],
  admin: [{ ApiKeyAuth: [] }, { SessionCookie: [] }],
  none: [],
};

const ERROR_RESPONSE = {
  description: 'Error',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
};

/** Build the OpenAPI 3.1 document for the REST API from the route manifest. */
export function buildOpenApiDocument(version: string): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of ROUTES) {
    const op: Record<string, unknown> = {
      tags: [route.tag],
      summary: route.summary,
      security: SECURITY_REQUIREMENT[route.security],
      responses: {
        [String(route.success?.status ?? 200)]: {
          description: route.success?.description ?? 'Success',
        },
        '400': ERROR_RESPONSE,
        ...(route.security !== 'none' ? { '401': ERROR_RESPONSE, '403': ERROR_RESPONSE } : {}),
      },
    };

    if (route.params?.length) {
      op.parameters = route.params.map((name) => ({
        name,
        in: 'path',
        required: true,
        schema: { type: 'string' },
      }));
    }
    if (route.request) {
      op.requestBody = {
        required: true,
        content: { 'application/json': { schema: toJsonSchema(route.request) } },
      };
    }

    paths[route.path] ??= {};
    paths[route.path]![route.method] = op;
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'mailctl API',
      version,
      description:
        'REST API for the mailctl mail control plane. The public sending API (`/send`, `/jobs`) uses an `X-Api-Key`; admin endpoints accept an admin API key or the dashboard session cookie.',
    },
    servers: [{ url: '/', description: 'This server' }],
    tags: [...new Set(ROUTES.map((r) => r.tag))].map((name) => ({ name })),
    components: {
      securitySchemes: {
        ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-Api-Key' },
        SessionCookie: { type: 'apiKey', in: 'cookie', name: 'mail-api-session' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: { error: { type: 'string' } },
          required: ['error'],
        },
      },
    },
    paths,
  };
}
