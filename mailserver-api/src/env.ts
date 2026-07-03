import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3050),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['silent', 'trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  DATABASE_URL: z.string().default('./data/data.db'),

  DMS_CONTAINER_NAME: z.string().default('mailserver'),
  DOCKER_SOCKET_PATH: z.string().default('/var/run/docker.sock'),

  /** Public IMAP/SMTP FQDN (e.g. mail.example.com). Enables mail-client autoconfig. */
  MAIL_HOSTNAME: z.string().optional(),

  NGINX_CONTAINER_NAME: z.string().default('nginx'),
  NGINX_GENERATED_DIR: z.string().default('./data/nginx-generated'),
  NGINX_RELOAD_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  /** Number of proxy hops to trust for X-Forwarded-For (set to 1 when behind nginx). */
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),

  /** If set, /metrics requires this token (Bearer header or ?token=). Open if unset. */
  METRICS_TOKEN: z.string().optional(),

  /** Verify TLS certs of outbound SMTP relays. Default true; opt-out only for trusted relays. */
  SMTP_TLS_REJECT_UNAUTHORIZED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  /** Allow webhook delivery to private/internal targets (SSRF opt-out). Default false. */
  WEBHOOK_ALLOW_PRIVATE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  /** Reject mailbox passwords found in the Have I Been Pwned breach corpus. Default true. */
  PASSWORD_HIBP_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  /** Minimum mailbox password length enforced by the strength policy. */
  PASSWORD_MIN_LENGTH: z.coerce.number().int().min(8).max(128).default(10),

  /** Optional webmail URL surfaced as a link in the dashboard (e.g. Roundcube). */
  WEBMAIL_URL: z.url().optional(),

  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters (run: openssl rand -hex 32)'),

  INITIAL_ADMIN_EMAIL: z.email().optional(),
  INITIAL_ADMIN_PASSWORD: z.string().min(8).optional(),

  /** Online backups of the panel SQLite DB (data.db). Mail-data is out of scope. */
  BACKUP_DIR: z.string().default('./data/backups'),
  BACKUP_INTERVAL_HOURS: z.coerce.number().positive().default(24),
  BACKUP_KEEP: z.coerce.number().int().positive().default(7),

  /** Delete finished send jobs / webhook deliveries older than this many days. 0 disables. */
  RETENTION_DAYS: z.coerce.number().int().min(0).default(30),

  /** Optional offsite upload to any S3-compatible store (AWS S3, MinIO, R2, …). */
  BACKUP_S3_ENDPOINT: z.string().optional(),
  BACKUP_S3_REGION: z.string().default('us-east-1'),
  BACKUP_S3_BUCKET: z.string().optional(),
  BACKUP_S3_ACCESS_KEY_ID: z.string().optional(),
  BACKUP_S3_SECRET_ACCESS_KEY: z.string().optional(),
  BACKUP_S3_PREFIX: z.string().default('mailserver/'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    console.error('Invalid environment variables:');
    for (const issue of result.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
      console.error(`  - ${path}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}
