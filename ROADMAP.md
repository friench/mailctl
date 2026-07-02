# Roadmap

Direction for the project — not a promise or a schedule; priorities shift with real
usage. Suggestions and PRs welcome via GitHub issues.

**Design principles.** docker-mailserver stays the mail engine — we orchestrate and
observe it, we don't reimplement Postfix/Dovecot. Every capability ships across all
three surfaces: **REST API + dashboard + MCP tool**. Automation- and API-first.

## Recently shipped

- Transactional `POST /send` with a durable queue, priority SMTP failover, and
  `text` / `replyTo` / attachment support.
- Domains + DKIM generation/rotation + SPF/DKIM/DMARC/MX/A DNS checks.
- Mailbox & alias provisioning into docker-mailserver; outbound SMTP relay accounts.
- Two-way DMS↔DB reconciliation ("sync") with operator-selected resolutions.
- Webhooks (HMAC-signed, retried, SSRF-guarded), Prometheus metrics, online backups
  with optional S3, retention pruning, feature flags.
- React dashboard and a standalone MCP server over the REST API.
- Security hardening pass: scoped keys, strict CSP, SSRF guard, TLS verification.

## Phase A — Quick wins

Small, high-visibility gaps — mostly enrichments of existing entities.

- **Enable/disable toggles** for domains and mailboxes (soft-disable without deleting).
- **Richer address model** — first-class **catch-all**, **blackhole/drop** addresses,
  and **whole-domain aliases**.
- **`send-only` mailboxes** (can send, cannot receive) and **mailbox forwarding**
  (deliver locally *and* forward).
- **Password quality on set** — strength scoring plus rejection of known-breached
  passwords (k-anonymity check).
- **DNS coverage** — add **PTR/reverse-DNS**, **AAAA**, **MTA-STS**, **TLS-RPT**, and
  autodiscovery records to generation and live checks.
- **Small conveniences** — free-text notes on entities, configurable webmail deep-link.

## Phase B — Differentiators & most-requested

- **Client autoconfiguration** — Thunderbird `autoconfig.xml`, Apple `.mobileconfig`
  profiles, and Outlook Autodiscover, served per domain.
- **Roles & multi-tenancy** — RBAC with **per-domain delegated admins** and
  owner-scoped isolation, so the panel can be handed to multiple operators/teams.
- **End-user self-service portal** — mailbox owners log in to change their own
  password, see quota usage, and download their client config (builds on RBAC).
- **Sieve rules + autoresponder / vacation** — per-mailbox server-side filtering and
  out-of-office replies (a gap in most existing tools).

## Phase C — Onboarding & observability

- **IMAP migration** — one-shot import of external mailboxes (IMAPSync-style) as
  queued jobs with per-job logs and status; a first-class onboarding path.
- **Inbound fetching** — periodic pull from external IMAP/POP3 accounts (fetchmail).
- **Engine observability** — expose Rspamd stats/actions (and a link into its UI),
  Dovecot stats, docker-mailserver feature toggles (`mailserver.env`), and companion
  container status/restart. We surface the engine; we don't replace it.
- **Operational read-only views** — log tail + search, mail-queue viewer, and active
  IMAP/POP3 sessions.

## Phase D — Scale & enterprise

- **OAuth2 / SSO** login (pairs with RBAC).
- **PostgreSQL** storage option for larger deployments (SQLite remains the default).
- **Bulk import/provisioning** from a JSON document.
- **Internationalization** of the dashboard.

## Extending our edge

Doubling down on what already sets the project apart:

- **docker-socket-proxy** in front of the raw Docker socket (least-privilege access).
- **Per-account SMTP TLS policy** — per-relay verification instead of one global flag.
- **Bounce / delivery feedback** — capture SMTP failures and DSNs into send-job
  records, surfaced in the dashboard and via webhooks.
- **OpenAPI specification** for the REST API (first-class, API-first).
- **Broaden the MCP server** to cover every new capability as it lands.
- **Suppression lists & per-key send policies**; deliverability tooling
  (reputation/DNSBL views).

## Ideas / exploratory

- Pluggable outbound transports (HTTP email providers alongside SMTP).
- Templated emails with variables and preview.
- End-to-end tests against a real docker-mailserver in CI.

Have a use case that isn't covered? Open an issue describing it.
