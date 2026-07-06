# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Self-hosted mail control plane: nginx + docker-mailserver + a custom Node.js admin/sending API with a React dashboard. Designed to be deployed for any domain (no project-specific hardcoding).

Three services managed by the root `docker-compose.yml`:

1. **nginx** (`jonasal/nginx-certbot`) — TLS termination + Let's Encrypt cert acquisition
2. **mailserver** (`docker-mailserver` 15.1.0) — SMTP/IMAP, OpenDKIM/DMARC/Fail2Ban
3. **mail-api** (this repo's `mailserver-api/`) — control plane (REST + dashboard) backed by SQLite

For the deep dive read `_docs/architecture.md` and `_docs/deployment.md`. This file lists fast-lookup commands and the layout.

## Repository layout

```
.env                          # docker-mailserver env (gitignored; .env.example committed)
docker-compose.yml            # full stack (nginx + mailserver + mail-api)
nginx/
  user_conf.d/
    default.conf              # hardened fallback vhost
    api.conf                  # static control plane vhost (you provide the hostname)
mailserver-api/
  src/                        # backend (TS, Express, Drizzle)
    env.ts logger.ts server.ts index.ts
    db/{client,migrate,schema}.ts
    domain/{apikeys,users,domains,smtp-accounts,send,queue,
            mailboxes,aliases,sync,webhooks,nginx,feature-flags,events}/
    workers/{send,webhook,sync}-worker.ts
    http/{routes,validators,middleware}/
    lib/{crypto,errors,async-handler,nginx-templates,webhook-signature}.ts
    bin/{create-admin,create-api-key}.ts
  ui/                         # React 18 + Vite + Tailwind v4 SPA, build → ui/dist
  drizzle/                    # generated SQL migrations (committed)
  data/                       # runtime: data.db (SQLite), nginx-generated/ (gitignored)
  tests/                      # Vitest + Supertest
mcp/                          # standalone MCP server (stdio) wrapping the REST API as tools
_docs/{architecture,deployment,cheatsheet}.md
```

## Common commands

### Stack lifecycle

```bash
docker compose build mail-api
docker compose up -d
docker compose logs -f mail-api
docker compose down
```

### mail-api dev (no docker)

```bash
cd mailserver-api
pnpm install
pnpm --dir ui install
SESSION_SECRET=$(openssl rand -hex 32) pnpm dev          # API on :3050
pnpm dev:ui                                               # UI on :5173 (proxies API)
pnpm test                                                 # vitest
pnpm typecheck && pnpm --dir ui typecheck
pnpm lint && pnpm format:check
pnpm build                                                # API + UI
```

### Schema migrations

```bash
cd mailserver-api
pnpm db:generate     # diff schema → new SQL file in drizzle/
pnpm db:migrate      # apply all pending
pnpm db:studio       # GUI
```

### Bootstrap

```bash
pnpm create-admin --email=admin@example.com --password=…  # first dashboard user
pnpm create-api-key --name=app --scopes=send              # plaintext shown once
```

### docker-mailserver shell ops (when UI doesn't suffice)

```bash
docker exec -it mailserver setup help
docker exec -it mailserver setup email list
docker exec -it mailserver setup config dkim domain example.com
# After that: POST /admin/api/mailboxes/sync to update mail-api's mirror
```

## Architecture pointers

- **Auth model**: `/admin/api/*` accepts EITHER an iron-session cookie OR an `X-Api-Key` with `admin` scope. `/send` and `/jobs/:id` are api-key only. Plaintext API keys/webhook secrets are shown ONCE on creation; only sha256 / generated secret values live in DB. The session cookie is opened by password login OR **OIDC/SSO** (`domain/auth/`): `/admin/auth/oidc/{start,callback}` run an authorization-code + PKCE flow (identity read from the IdP `userinfo` endpoint over TLS — no local JWT verification), state stored in the session; users are matched by email and optionally auto-provisioned (`OIDC_AUTO_PROVISION`, `OIDC_DEFAULT_ROLE`, `OIDC_ADMIN_EMAILS`). Enabled when `OIDC_ISSUER`/`CLIENT_ID`/`CLIENT_SECRET`/`REDIRECT_URI` are set; the pre-auth login page reads `GET /admin/auth/config`.
- **Send pipeline**: `POST /send` → `send_jobs` row (`pending`) → `SendWorker` claims atomically (drizzle `db.transaction`) → `MailSender` (priority-ordered failover with transient retries inside an account) → mark `done`/`dead` + dispatch `send.completed`/`send.failed` events.
- **Webhooks**: `WebhookService.dispatch(event, payload)` creates `webhook_deliveries` rows; `WebhookWorker` POSTs them with `X-Webhook-Signature: sha256=<hex>` over `${timestamp}.${body}`.
- **nginx generation** (Phase 8): `NginxService.regenerate()` writes one `mail-<domain>.conf` per active domain into `data/nginx-generated/` (mounted into the nginx container) and runs `nginx -s reload`. Triggered on every domain CRUD + on startup.
- **Feature flags**: in-memory cache (TTL 30s); flips via `PATCH /admin/api/feature-flags/:key` invalidate the cache. Known flags: `webhooks_enabled`, `queue_enabled`, `webhook_worker_enabled`, `auto_dkim_enabled`, `backups_enabled`, `sync_preview_notify`, `quarantine_retention_enabled`.
- **DMS↔DB sync** (`domain/sync/`): two-way reconciliation between docker-mailserver and `data.db`. `GET /admin/api/sync/preview` computes per-element divergence items (domain/mailbox/alias/dkim) via the pure `diff()`; `POST /admin/api/sync/apply` executes only operator-selected resolutions (`import`/`push`/`field_pick`/`delete_*`/`skip`) — deletes need `confirmDeletes`, stale previews are rejected by `stateHash`. Nothing auto-applies; `SyncWorker` (flag `sync_preview_notify`, default off) only computes a diff and fires `sync.divergence_detected`. See `_docs/mailserver-panel-sync-task.md`.
- **Spam & access control**: spam lands in each mailbox's Junk folder; `domain/quarantine/` manages it via `doveadm` (list/release/delete + `quarantine_retention_enabled` worker). `domain/access-lists/` stores sender/domain/IP allow+block rules (optionally per-recipient) and renders them (pure `lib/access-rules.ts`) into Postfix access maps + Rspamd multimaps (global) and an Rspamd Lua prefilter (per-recipient), written into DMS via `DmsClient.writeAccessConfig`.
- **Engine observability** (`domain/engine/`): read-only `GET /admin/api/engine/overview` aggregates Rspamd stats (`rspamc stat`), Dovecot stats (`doveadm stats dump`), docker-mailserver toggles (`/etc/dms-settings`), and stack container status via a separate `EngineClient` (dockerode, not the DmsClient); `POST /admin/api/engine/containers/:name/restart` is allow-listed to `ENGINE_CONTAINERS`. Parsers are pure (`lib/engine-parsers.ts`).
- **Operational views** (`domain/ops/`): read-only `GET /admin/api/ops/{logs,queue,sessions}` — mail-log tail/search (`tail` of `MAIL_LOG_PATH`, filtered in Node), Postfix queue (`postqueue -p`), and active IMAP/POP3 sessions (`doveadm who`) via a separate `OpsClient`. Parsers are pure (`lib/ops-parsers.ts`).
- **IMAP migration** (`domain/migrations/`): one-shot import queue mirroring the send pipeline — `POST /admin/api/migrations` enqueues a job; `MigrationWorker` claims it serially and runs `DoveadmMigrator` (`doveadm backup -R … imapc:` inside DMS; `-R` reverse = idempotent pull). Source password is encrypted at rest (`lib/secret-box.ts`, AES-256-GCM from `SESSION_SECRET`) and wiped on any terminal state; per-job `log`/`status`. Crash recovery resets `processing`→`pending`.
- **Bounce / DSN capture** (`domain/bounces/`): `POST /admin/api/bounces/ingest` accepts a raw DSN email (`text/*` / `message/rfc822`, or JSON `{raw}`); the pure `lib/dsn-parser.ts` extracts per-recipient status/diagnostic + the original Message-ID, which correlates to a `send_jobs` row via `messageId`. Each recipient becomes a `bounce_events` row (hard/soft/unknown) and fires a `send.bounced` event. `GET /admin/api/bounces` lists them. Feeding bounce mail to the ingest endpoint is a deployment step (Postfix pipe / forwarder) — no in-app mailbox poller.
- **Bulk import** (`domain/import/`): idempotent `POST /admin/api/import` (admin-only) provisions domains→mailboxes→aliases from a JSON doc, reusing the existing services; existing entities are skipped (never mutated), failures are per-item and don't abort the run, `?dryRun=true` previews. Validation runs in both modes.
- **Inbound fetching** (`domain/fetchmail/`): recurring pull from external IMAP/POP3. CRUD of accounts; every change re-renders `fetchmail.cf` (pure `lib/fetchmail.ts`, passwords decrypted via the shared SecretBox) and `DmsClient.writeFetchmailConfig` writes it into DMS + restarts the daemon. Requires `ENABLE_FETCHMAIL=1` / `FETCHMAIL_POLL` in the mailserver. Passwords encrypted at rest, never returned.
- **Crash semantics**: workers reset `processing` rows back to `pending` on startup → at-least-once delivery for both send and webhook pipelines.

## Key config

| Env var | Default | Notes |
|---|---|---|
| `SESSION_SECRET` | (required, ≥32 chars) | iron-session encryption key |
| `DATABASE_URL` | `./data/data.db` | SQLite file (WAL mode) |
| `NGINX_CONTAINER_NAME` / `NGINX_GENERATED_DIR` / `NGINX_RELOAD_ENABLED` | `nginx` / `./data/nginx-generated` / `true` | Phase 8 vhost generation |
| `DMS_CONTAINER_NAME` / `DOCKER_SOCKET_PATH` | `mailserver` / `/var/run/docker.sock` | Mailbox provisioning via `docker exec` |
| `TRUST_PROXY` | `0` | Set to `1` when behind nginx so `req.ip` is correct |
| `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` | (optional) | Bootstrap first admin if `users` table is empty |
