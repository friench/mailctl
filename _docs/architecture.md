# Architecture

A self-hosted mail control plane that wraps three Docker services:

```
                     ┌──────────────────────────────────────────┐
                     │         Internet (TLS on 443/465/...)     │
                     └────────────────┬─────────────────────────┘
                                      │
                          ┌───────────▼────────────┐
                          │         nginx          │  jonasal/nginx-certbot
                          │  (TLS, Let's Encrypt)  │  serves /admin/* + /admin/api/*
                          └─────┬───────────┬──────┘
                                │           │
                proxy /admin/*  │           │ shared volume:
                                ▼           │   /etc/letsencrypt
                          ┌─────────────┐   │ shared volume:
                          │  mail-api   │   │   nginx-generated/  ← writes per-domain vhosts
                          │ (Express +  │   │
                          │  React UI)  │   │
                          │  port 3050  │   │
                          └──┬──────┬───┘   │
              docker.sock    │      │       │
              (exec setup,   │      │       ▼
               nginx -s      │      │   ┌────────────────────────┐
               reload)       │      └──▶│ docker-mailserver      │
                             │          │ (Postfix + Dovecot +    │
                       file: │          │  OpenDKIM/DMARC/Fail2Ban)│
                       data.db          │  ports 25/465/587/993   │
                       (SQLite)         └────────────────────────┘
```

## Components

### nginx (`jonasal/nginx-certbot`)

- TLS termination on `:443`, `:80` for ACME challenges
- Hand-written vhosts in `nginx/user_conf.d/*.conf` for the control plane
- Per-domain mail vhosts under `nginx/user_conf.d/generated/` are written by mail-api on every domain CRUD (Phase 8). Each new vhost makes nginx-certbot acquire a Let's Encrypt cert for `mail.<domain>` so docker-mailserver can serve TLS for it.
- Volume `nginx_secrets` is shared read-only with docker-mailserver so it can read certs from `/etc/letsencrypt/`.

### docker-mailserver

- All-in-one SMTP/IMAP/anti-spam stack
- Configured via env (`./.env`) and config files in `docker-data/dms/config/`
- mail-api provisions mailboxes/aliases through `docker exec mailserver setup …` (over the docker.sock the API has access to)

### mail-api (this repo's `mailserver-api/`)

Single Node.js process that owns the control plane:

| Layer | Files | Responsibility |
|---|---|---|
| `db/` | better-sqlite3 + Drizzle, WAL mode | One SQLite file `data.db`, schema drives `drizzle/*.sql` migrations |
| `domain/apikeys/` | repo + service | sha256-hashed keys with prefix lookup, scopes, expiry |
| `domain/users/` | repo + service | argon2id passwords, multi-admin |
| `domain/domains/` | repo | DKIM metadata, active flag |
| `domain/smtp-accounts/` | repo + loader | Outbound senders; credentials resolved from env-var names |
| `domain/send/` | mailer | Multi-account failover with transient retry |
| `domain/mailboxes/` | repo + service + DmsClient | CRUD that talks to docker-mailserver via `docker exec` |
| `domain/queue/` | repo + service | Persistent send queue with atomic claim, retry/backoff, dead-letter |
| `domain/webhooks/` | repos + service | Subscribers + persisted deliveries with HMAC-SHA256 signatures |
| `domain/nginx/` | service + reloader | Generates vhost files per active domain, runs `nginx -s reload` |
| `domain/feature-flags/` | registry + service | Cached on/off toggles for queue/webhooks/etc. |
| `workers/` | send-worker, webhook-worker | Long-poll workers honoring feature flags + recovery on startup |
| `http/` | routes, validators (zod), middleware | REST + dashboard auth; admin endpoints accept session OR admin-scoped api-key |
| `ui/` | React 18 + Vite + Tailwind v4 + TanStack Query | SPA bundled into Express static dir |

## Auth model

| Endpoint | Required auth |
|---|---|
| `POST /send`, `GET /jobs/:id` | API key in `X-Api-Key` header (sha256 + timing-safe verify) |
| `GET /jobs/:id` (admin) | API key with `admin` scope OR session — sees all jobs |
| `/admin/auth/*` | Public (login itself) |
| `/admin/api/*` | Session cookie (iron-session) OR API key with `admin` scope |
| `/admin/*` (UI) | Static files; auth checked by SPA via `/admin/auth/me` |

## Data flow: `POST /send`

```
client ─▶ /send (rate-limit + api-key auth)
            │
            ├─▶ zod-validate body
            ├─▶ mailer.validateFrom (if provided)
            └─▶ queue.enqueue → 202 + jobId

worker (every 2s):
  queue.claimNextPending  ─▶ mailer.send  ─▶ markDone + dispatch send.completed
                                    │
                                    └─ on failure: retry-with-backoff or markDead

webhook worker (every 2s):
  webhook_deliveries.claimNextPending  ─▶ POST url with HMAC-SHA256
                                                │
                                                └─ markDone / retry / dead
```

## Persistence

- One SQLite file (`data.db`), WAL mode, single writer. Backup with `sqlite3 data.db .backup <path>` while running, or volume snapshot.
- Migrations in `drizzle/` are append-only and run on every startup.
- All secrets that must be readable at runtime (SMTP passwords, webhook secrets) stay either in env vars (referenced by name from `smtp_accounts.user_env_var`) or as plaintext JSON columns where required by the protocol (HMAC verification needs the raw secret).

## Crash semantics

| Failure | Recovery |
|---|---|
| mail-api crashes during a send | Job left in `processing` → `recoverStuckJobs()` on startup resets to `pending` → worker retries. **At-least-once.** |
| mail-api crashes during webhook delivery | Same recovery path for webhook_deliveries |
| docker-mailserver `setup email add` succeeds but DB insert fails | The next reconcile (`POST /admin/api/mailboxes/sync`) re-imports it from DMS |
| nginx reload fails | Generated configs stay on disk; admin can retry via PATCH on a domain. |
