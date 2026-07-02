# mailctl — self-hosted mail control plane

A self-hostable mail stack with a programmable control plane: **nginx** (TLS + Let's
Encrypt) + **docker-mailserver** (SMTP/IMAP, DKIM/DMARC/SPF, Fail2Ban) + a custom
**Node.js API and React dashboard** for managing domains, mailboxes, outbound sending,
webhooks and more. Designed to be deployed for **any domain** — no project-specific
hardcoding.

> Bring up a production-grade mail server and drive everything (domains, DKIM,
> mailboxes, transactional send, webhooks) over a REST API, a web dashboard, or an
> MCP server — instead of hand-editing config files.

## Why

Running your own mail server is powerful but fiddly: DKIM keys, DNS records, mailbox
provisioning and outbound relays usually mean SSH and manual edits. This project keeps
the battle-tested [docker-mailserver](https://github.com/docker-mailserver/docker-mailserver)
for the actual mail, and adds a thin, auditable **control plane** on top so apps and
operators can manage it programmatically and send transactional email over HTTPS.

## Features

**Sending**
- `POST /send` transactional API — HTML/text, `Reply-To`, up to 10 attachments (≤10 MB).
- Durable job queue (SQLite) with **priority-ordered SMTP failover** across multiple
  relays and transient-error retries. Async by default (`202` + `GET /jobs/:id`), or
  synchronous with `?wait=true`.
- Scoped, hashed **API keys** (`send` / `admin`); plaintext shown once.

**Domain & mailbox management**
- Domains CRUD, **DKIM** key generation/rotation, and a **DNS check** for SPF / DKIM /
  DMARC / MX / A records.
- Mailboxes and aliases provisioned directly in docker-mailserver (with quotas).
- Outbound **SMTP accounts** with credentials referenced by env-var name (never stored).
- **Two-way DMS↔DB reconciliation ("sync")**: preview divergence between
  docker-mailserver and the panel DB and apply only the resolutions you pick.

**Operations**
- **Webhooks** with HMAC-SHA256 signatures, a retry worker, and an SSRF guard.
- **Per-domain nginx vhost generation** + reload.
- **Backups** — online SQLite snapshots with rotation and optional S3 offsite copy.
- **Prometheus `/metrics`** endpoint + a dashboard Stats page.
- **Feature flags**, retention pruning, and crash-safe workers (at-least-once delivery).

**Interfaces**
- **React 18 dashboard** (Vite + Tailwind) for all of the above.
- **MCP server** (`mcp/`) exposing the REST API as tools for AI agents.

## Architecture

Three services orchestrated by the root `docker-compose.yml`:

| Service | Image | Role |
|---|---|---|
| `nginx` | `jonasal/nginx-certbot` | TLS termination + Let's Encrypt cert acquisition |
| `mailserver` | `docker-mailserver` | SMTP/IMAP, OpenDKIM/OpenDMARC/Fail2Ban |
| `mail-api` | this repo (`mailserver-api/`) | control plane (REST + dashboard), SQLite-backed |

The API is TypeScript + Express + Drizzle ORM over SQLite (WAL). Background workers
(send, webhook, sync, backup, retention) are long-polling, feature-flag-gated, and
reset in-flight work on startup for at-least-once semantics. See
[`_docs/architecture.md`](_docs/architecture.md) for the deep dive.

## Quick start

Prerequisites: a Linux host with Docker + Compose v2, a public IPv4, DNS `A` record for
`mail.example.com`, and outbound port 25 open.

```bash
git clone https://github.com/friench/mailctl.git mailctl && cd mailctl

# docker-mailserver settings
cp .env.example .env                     # set MAIL_HOSTNAME, POSTMASTER_ADDRESS, TZ

# mail-api control plane
cp mailserver-api/.env.example mailserver-api/.env
#   set SESSION_SECRET (openssl rand -hex 32) and INITIAL_ADMIN_EMAIL/PASSWORD

docker volume create nginx_nginx_secrets # shared cert volume (first time only)
docker compose build mail-api
docker compose up -d
```

Then open `https://<your-host>/admin/login`, add your first domain (DKIM selector),
SMTP account, mailbox, and an API key — or do it all over the REST API / MCP server.
Full walkthrough: [`_docs/deployment.md`](_docs/deployment.md). A Dokploy path and a
`docker-compose.dokploy.yml` are included.

### Send a test email

```bash
curl -X POST https://<your-host>/api/send \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: <your-api-key>" \
  -d '{"to":"you@example.com","subject":"It works","html":"<p>Hello.</p>"}'
# → 202 { "ok": true, "id": "<jobId>", "status": "pending" }
```

## Development

```bash
cd mailserver-api
pnpm install && pnpm --dir ui install
SESSION_SECRET=$(openssl rand -hex 32) pnpm dev   # API on :3050
pnpm dev:ui                                        # dashboard on :5173
pnpm test && pnpm typecheck && pnpm lint           # 322 tests (Vitest + Supertest)
```

See [`CLAUDE.md`](CLAUDE.md) for a fast command/layout reference and
[`mailserver-api/README.md`](mailserver-api/README.md) for the API package.

## Documentation

- [`_docs/architecture.md`](_docs/architecture.md) — components, data model, pipelines.
- [`_docs/deployment.md`](_docs/deployment.md) — bring-up on a fresh host (+ Dokploy).
- [`_docs/cheatsheet.md`](_docs/cheatsheet.md) — common operations.
- [`ROADMAP.md`](ROADMAP.md) — what's next.

## Security

Secrets (API keys, webhook signing secrets) are shown once and stored only as hashes.
Auth is via iron-session cookies or admin-scoped API keys; the dashboard enforces a
strict CSP, webhook delivery is SSRF-guarded, and outbound SMTP verifies TLS by default.
The control plane provisions mailboxes via the Docker socket — in production, front it
with a docker-socket-proxy (see roadmap). Please report vulnerabilities via a private
GitHub security advisory rather than a public issue.

## License

[MIT](LICENSE).
