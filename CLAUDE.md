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
    api.conf.example          # control-plane vhost template (copy → api.conf, set hostname)
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
- **Per-account SMTP TLS**: each `smtp_accounts` row carries a TLS policy — `requireTls` (force STARTTLS), `rejectUnauthorized` (cert verification; null = inherit `SMTP_TLS_REJECT_UNAUTHORIZED`), `minTlsVersion`. `mailer.buildTransportOptions()` (pure, unit-tested) maps it onto the nodemailer transport.
- **Send pipeline**: `POST /send` → `send_jobs` row (`pending`) → `SendWorker` claims atomically (drizzle `db.transaction`) → `MailSender` (priority-ordered failover with transient retries inside an account) → mark `done`/`dead` + dispatch `send.completed`/`send.failed` events.
- **Webhooks**: `WebhookService.dispatch(event, payload)` creates `webhook_deliveries` rows; `WebhookWorker` POSTs them with `X-Webhook-Signature: sha256=<hex>` over `${timestamp}.${body}`.
- **nginx generation** (Phase 8): `NginxService.regenerate()` writes one `mail-<domain>.conf` per active domain into `data/nginx-generated/` (mounted into the nginx container) and runs `nginx -s reload`. Triggered on every domain CRUD + on startup.
- **Feature flags**: in-memory cache (TTL 30s); flips via `PATCH /admin/api/feature-flags/:key` invalidate the cache. Known flags: `webhooks_enabled`, `queue_enabled`, `webhook_worker_enabled`, `auto_dkim_enabled`, `backups_enabled`, `sync_preview_notify`, `quarantine_retention_enabled`.
- **DMS↔DB sync** (`domain/sync/`): two-way reconciliation between docker-mailserver and `data.db`. `GET /admin/api/sync/preview` computes per-element divergence items (domain/mailbox/alias/dkim) via the pure `diff()`; `POST /admin/api/sync/apply` executes only operator-selected resolutions (`import`/`push`/`field_pick`/`delete_*`/`skip`) — deletes need `confirmDeletes`, stale previews are rejected by `stateHash`. Nothing auto-applies; `SyncWorker` (flag `sync_preview_notify`, default off) only computes a diff and fires `sync.divergence_detected`. See `_docs/mailserver-panel-sync-task.md`.
- **Spam & access control**: spam lands in each mailbox's Junk folder; `domain/quarantine/` manages it via `doveadm` (list/release/delete + `quarantine_retention_enabled` worker). `domain/access-lists/` stores sender/domain/IP allow+block rules (optionally per-recipient) and renders them (pure `lib/access-rules.ts`) into Postfix access maps + Rspamd multimaps (global) and an Rspamd Lua prefilter (per-recipient), written into DMS via `DmsClient.writeAccessConfig`.
- **Engine observability** (`domain/engine/`): read-only `GET /admin/api/engine/overview` aggregates Rspamd stats (`rspamc stat`), Dovecot stats (`doveadm stats dump`), docker-mailserver toggles (`/etc/dms-settings`), and stack container status via a separate `EngineClient` (dockerode, not the DmsClient); `POST /admin/api/engine/containers/:name/restart` is allow-listed to `ENGINE_CONTAINERS`. Parsers are pure (`lib/engine-parsers.ts`).
- **Operational views** (`domain/ops/`): read-only `GET /admin/api/ops/{logs,queue,sessions}` — mail-log tail/search (`tail` of `MAIL_LOG_PATH`, filtered in Node), Postfix queue (`postqueue -p`), and active IMAP/POP3 sessions (`doveadm who`) via a separate `OpsClient`. Parsers are pure (`lib/ops-parsers.ts`).
- **IMAP migration** (`domain/migrations/`): one-shot import queue mirroring the send pipeline — `POST /admin/api/migrations` enqueues a job; `MigrationWorker` claims it serially and runs `DoveadmMigrator` (`doveadm backup -R … imapc:` inside DMS; `-R` reverse = idempotent pull). Source password is encrypted at rest (`lib/secret-box.ts`, AES-256-GCM from `SESSION_SECRET`) and wiped on any terminal state; per-job `log`/`status`. Crash recovery resets `processing`→`pending`.
- **OpenAPI** (`lib/openapi.ts`): `GET /openapi.json` serves an OpenAPI 3.1 document built from a compact route manifest; request bodies are derived from the real zod validators via `z.toJSONSchema` (zod v4) so the spec can't drift from validation. `pnpm openapi:emit [file]` writes it for CI / client generation (e.g. `npx @openapitools/openapi-generator-cli`). Public.
- **Suppression list** (`domain/suppressions/`): recipient addresses that `POST /send` refuses to deliver to (422) — enforced in the send route unless the API key is `suppressionExempt` (a per-key send policy, toggled via `PATCH /admin/api/api-keys/:id`). Hard bounces auto-populate it (BounceService → `addFromBounce`). CRUD at `/admin/api/suppressions`.
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
| `DOCKER_HOST` | (unset) | When set (e.g. `tcp://docker-socket-proxy:2375`) all dockerode clients connect via the proxy instead of the raw socket. `lib/docker.ts` resolves the connection; the default compose wires a least-privilege `tecnativa/docker-socket-proxy`. |
| `TRUST_PROXY` | `0` | Set to `1` when behind nginx so `req.ip` is correct |
| `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` | (optional) | Bootstrap first admin if `users` table is empty |

---

## Working style

Behavioral and review guidelines for this project. Bias toward caution over speed; for trivial tasks, use judgment.

## 0. Start Mode

Before starting any non-trivial task, ask:

**Is this a BIG, SMALL, or TRIVIAL change?**

- **BIG** — full review across all sections (Architecture → Code → Tests → Performance), top 3–4 issues per section, pause for feedback after each.
- **SMALL** — one focused question per section, keep the review concise.
- **TRIVIAL** — skip the structured review; apply behavioral rules (§1–§5) directly.

For BIG and SMALL changes, do NOT begin implementation until the plan is reviewed and approved.

---

## 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

For every issue or recommendation:

- Explain concrete tradeoffs
- Give an opinionated recommendation (not a neutral summary)
- Ask for input before proceeding

---

## 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios (real edge cases are covered in §4).
- If you write 200 lines and it could be 50, rewrite it.

Test: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

---

## 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

Test: every changed line should trace directly to the request.

---

## 4. Engineering Principles

- **DRY** — aggressively flag _real_ duplication. Do not pre-abstract for hypothetical reuse (see §2).
- **Well-tested code is mandatory** for non-trivial logic — better too many tests than too few. Trivial glue code does not need tests.
- **Engineered enough** — not fragile or hacky, not over-engineered.
- **Correctness over speed of implementation** — think hard about real edge cases.
- **Explicit over clever.**

> Note on §2 ↔ §4 tension: §2 governs _scope and abstraction_; §4 governs _correctness of what you ship_. Don't write tests for code that shouldn't exist, but don't ship untested non-trivial logic to stay "minimal."

---

## 5. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria enable independent looping. Weak criteria ("make it work") require constant clarification.

---

## 6. Review Sections (BIG changes)

### 6.1 Architecture

- Overall system design and component boundaries
- Dependency graph and coupling risks
- Data flow and potential bottlenecks
- Scaling characteristics and single points of failure
- Security boundaries (auth, data access, API limits)

### 6.2 Code Quality

- Project structure and module organization
- DRY violations
- Error handling patterns and missing edge cases
- Technical debt risks
- Areas over- or under-engineered

### 6.3 Tests

- Coverage (unit, integration, e2e)
- Quality of assertions
- Missing edge cases
- Untested failure scenarios

### 6.4 Performance

- N+1 queries or inefficient I/O
- Memory usage risks
- CPU hotspots or heavy code paths
- Caching opportunities
- Latency and scalability concerns

After each section, pause and ask for feedback. Do NOT implement until confirmed.

---

## 7. Issue Format

For each issue found, provide:

1. Clear description of the problem
2. Why it matters
3. 2–3 options (including "do nothing" if reasonable)
4. For each option: **effort / risk / impact / maintenance cost**
5. Recommended option and why

Then ask for approval before moving forward.

---

## 8. Output Style

- Structured and concise
- Opinionated recommendations, not neutral summaries
- Focus on real risks and tradeoffs
- Think like a Staff/Senior Engineer reviewing a production system

---

## 9. Documentation & Context

- Use **Context7 MCP** automatically when library/API documentation, code generation, or setup/configuration steps are needed — without explicit request.
- When generating code, verify against up-to-date docs for the specific version in use.
- Reference project documentation in `_docs/` before making architectural decisions.

---

## 10. Workflow Rules

- Do NOT assume priorities or timelines.
- Pause for feedback after each review section on BIG changes.
- Do NOT implement until confirmed.
- Clarifying questions come **before** implementation, not after mistakes.

---

## 11. Agent Teams

When a task is non-trivial, prefer to **dispatch a team** rather than work alone: one role plays tech-lead/router (usually the conversation itself), others do focused implementation, and a final pass re-verifies everything.

### 11.1 Subagent types worth knowing

- **`Explore`** — read-only search agent. Cheap. Use it before writing anything when the scope spans more than 2-3 files. It reads excerpts, not whole files — not suitable for cross-file consistency checks.
- **`general-purpose`** — the main implementation agent (TS backend, React UI, MCP server), and the fallback for cross-cutting chores.
- **`Plan`** — when you need an explicit step-by-step implementation plan before writing code.
- **Specialists** (`fullstack-dev-skills:{code-reviewer,security-reviewer,test-master,…}`) — the auth/session/API-key surface and the docker-exec paths are security-sensitive; use `security-reviewer` on changes touching them.

### 11.2 Orchestration patterns that work

- **Parallel-by-file-boundary** (most common): N agents at once, each owning a disjoint set of files; zero merge conflicts at integration. Here that maps to: a `domain/` module vs. its routes/validators vs. UI pages vs. `mcp/`.
- **Tech-lead sweep**: when work touches **shared** files (`schema.ts`, route registration, `openapi.ts` manifest, i18n locales), agents write only their owned files and the tech-lead applies shared-file edits post-factum.
- **Sequential by dependency**: don't parallelise across a contract you haven't agreed yet (e.g. a new table schema must land before the worker consuming it).
- **Scout first, plan, then implement**; **worktree isolation** (`isolation: "worktree"`) only when file overlap is unavoidable.

### 11.3 Verification discipline (learned the hard way)

- **Agents commonly claim "verification pending" when shell access is denied to them.** Always re-run typecheck + lint + tests as the tech-lead after each agent returns. Do not trust self-reports of "all looks correct".
- **Agents over-report test counts.** Verify with `pnpm test` directly, not the agent's tally.
- **Agents do not commit.** Tech-lead commits after review, grouping by logical concern.
- **Revision cycles** — up to 10 per task, but in practice 0-1 is typical with sufficient briefing. If you hit cycle 3, the prompt was wrong; rewrite it.

---

## 12. Git Workflow

### 12.1 Remotes — check before every push

- **`mailctl`** (`friench/mailctl`) — the **working** remote: `main` tracks `mailctl/main`, issues and PRs live here.
- **`origin`** (`friench/mailserver`) — the public release mirror. Push there only deliberately (release/`chore/public-release` work), never as a side effect.

### 12.2 Branches & PRs

- **`main`** — default and target branch. Feature branches `<type>/<short-name>` (`feat/mcp-coverage`, `fix/security-hardening`, `refactor/service-layer`, `infra/deployment-hardening`).
- PRs go to `main` on `mailctl` and are **squash-merged** (linear history; the squash title keeps the `(#N)` suffix). Merge is the owner's call.
- Direct pushes to `main` have happened for urgent deploy-fixes only; the default path is a PR.

### 12.3 CI & commits

- [ci.yml](./.github/workflows/ci.yml) runs on push/PR to `main`: `pnpm lint`, `format:check`, API + UI `typecheck`, `test`, `build` (all in `mailserver-api/`). Green CI before merge; reproduce failures locally with the same commands — don't debug by re-pushing.
- Conventional-Commits-style prefixes (`feat`, `fix`, `chore`, `refactor`, `perf`, `infra`); subjects may be in Russian — match the existing style.
- Do NOT append the `Co-Authored-By: Claude ...` trailer (or any Claude/Anthropic co-author line) to commit messages. End the commit message at the actual content.

---

## 13. Skills

Invoke via the Skill tool (or `/<name>`). Available in sessions on this host:

### 13.1 User-level (`~/.claude/skills/`, available in every session)

- **`apple-design`** — Apple-style interface design and fluid motion for the web: gestures, spring animations, sheets/drawers, translucency, typography, reduced-motion. Use when building or reviewing the React dashboard (`mailserver-api/ui/`).
- **`github-issues`** — gh CLI + Projects-v2 board mechanics on this host. Use for any work on the `friench/mailctl` issue tracker.
- **`agent-loop`** — supervised board-driven iteration; project config in [AGENT_LOOP.md](./AGENT_LOOP.md) (check its launch prerequisites before starting a loop).
- **`drift`** — autonomous discovery mode (no code changes; findings become `drift`-labeled issues in `friench/mailctl`); project config in [DRIFT.md](./DRIFT.md).
- **`humanize-text`** — rewrite text into a natural human voice (README, release notes).
- **agentmemory suite** — `recall`, `remember`, `recap`, `handoff`, `session-history`, `commit-context`, `commit-history`, `forget`. Use `handoff`/`recall` at session start to pick up prior context; `remember` for decisions worth keeping.

### 13.2 Project-level ([.claude/skills/](./.claude/skills/))

- **`drizzle`** — Drizzle ORM patterns for this repo (schema in `src/db/schema.ts`, generated SQL migrations in `drizzle/`). Use for any schema/migration work.
