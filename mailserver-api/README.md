# mailserver-api

The control-plane service for the [mailserver](../README.md) stack: a REST API and
React dashboard that manage docker-mailserver (domains, mailboxes, aliases, DKIM) and
send transactional email over HTTPS with a durable queue and SMTP failover.

TypeScript · Express · Drizzle ORM · SQLite (WAL) · React 18 + Vite + Tailwind.

## Layout

```
src/
  server.ts index.ts env.ts logger.ts
  db/{client,migrate,schema}.ts        # Drizzle schema + SQLite
  domain/                              # apikeys, users, domains, smtp-accounts,
                                       # send, queue, mailboxes, aliases, sync,
                                       # webhooks, nginx, feature-flags, backups, …
  workers/{send,webhook,sync,backup,retention}-worker.ts
  http/{routes,validators,middleware}/
  lib/{crypto,errors,ssrf,webhook-signature,…}.ts
  bin/{create-admin,create-api-key}.ts
ui/                                    # React SPA, builds to ui/dist (served at /admin)
drizzle/                               # generated SQL migrations (committed)
tests/                                 # Vitest + Supertest
```

## Development

```bash
pnpm install && pnpm --dir ui install
SESSION_SECRET=$(openssl rand -hex 32) pnpm dev   # API on :3050
pnpm dev:ui                                        # dashboard on :5173 (proxies API)

pnpm test          # Vitest + Supertest
pnpm typecheck && pnpm lint && pnpm format:check
pnpm build         # API (dist/) + UI (ui/dist/)
```

Database migrations (Drizzle):

```bash
pnpm db:generate   # diff schema → new SQL file in drizzle/
pnpm db:migrate    # apply pending
pnpm db:studio     # GUI
```

Bootstrap:

```bash
pnpm create-admin --email=admin@example.com --password=…
pnpm create-api-key --name=app --scopes=send      # plaintext shown once
```

## API surface (summary)

- `POST /send` (api-key, scope `send`) — enqueue an email; `202 { ok, id, status }`,
  or `?wait=true` for a synchronous result. Body: `{ to, subject, html, from?, text?,
replyTo?, attachments? }`.
- `GET /jobs/:id` — send-job status.
- `GET /health`, `GET /metrics` (token-guarded).
- `/admin/api/*` — domains, mailboxes, aliases, smtp-accounts, api-keys, webhooks,
  sync, feature-flags, backups, stats, users (session cookie **or** admin-scoped key).
- Dashboard served at `/admin`.

## Auth

`/send` and `/jobs/:id` require an API key. `/admin/api/*` accepts either an
iron-session cookie or an `X-Api-Key` with the `admin` scope. API keys and webhook
secrets are shown once on creation; only their sha256 / generated values are stored.

See the repo root [README](../README.md), [`_docs/architecture.md`](../_docs/architecture.md),
and [`_docs/deployment.md`](../_docs/deployment.md) for the full picture.
