# Roadmap

Direction for the project. Not a promise or a schedule — priorities shift with real
usage. Suggestions and PRs welcome via GitHub issues.

## Recently shipped

- Transactional `POST /send` with a durable queue, priority SMTP failover, and
  `text` / `replyTo` / attachment support.
- Domains + DKIM generation/rotation + SPF/DKIM/DMARC/MX/A DNS checks.
- Mailbox & alias provisioning into docker-mailserver; outbound SMTP accounts.
- Two-way DMS↔DB reconciliation ("sync") with operator-selected resolutions.
- Webhooks (HMAC-signed, retried, SSRF-guarded), Prometheus metrics, online backups
  with optional S3, retention pruning, feature flags.
- React dashboard and a standalone MCP server over the REST API.
- Security hardening pass: scoped keys, strict CSP, SSRF guard, TLS verification.

## Near-term

- **Docker socket hardening** — front the raw Docker socket with a
  docker-socket-proxy (allow only the container/exec calls provisioning needs) and
  point the API at the proxy.
- **Per-account SMTP TLS policy** — move TLS-verification from a single global flag to
  a per-SMTP-account setting, so trusted internal relays and verified external relays
  can coexist without weakening either.
- **Bounce / delivery feedback** — capture SMTP failures and (where available) DSNs
  into the send-job record and surface them in the dashboard and via webhooks.
- **Docs & examples** — provider recipes (common SMTP relays), a hardening checklist,
  and an OpenAPI spec for the REST API.

## Later

- **Roles & multi-user** — beyond a single admin: read-only and per-scope roles, plus
  an audit log of control-plane actions.
- **Suppression list & rate policy** — per-recipient suppression and configurable
  send policies/quotas per API key.
- **Deliverability tooling** — MTA-STS / TLS-RPT helpers, DNSBL checks, and a
  warm-up/reputation dashboard.
- **Shared type contracts for the MCP server** and a REST client shared between the
  MCP server and the dashboard, to remove drift across the three surfaces.

## Ideas / exploratory

- Pluggable outbound transports (HTTP email providers alongside SMTP).
- Templated emails with variables and a preview.
- Multi-node / HA notes and a Postgres storage option for larger deployments.
- End-to-end tests against a real docker-mailserver in CI.

Have a use case that isn't covered? Open an issue describing it.
