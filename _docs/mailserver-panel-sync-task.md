# Task: two-way reconciliation between docker-mailserver and the panel DB

> **Audience:** the coding agent working in this repo (`mailserver-api`, the `mail-api` service).
> This spec is grounded in the *actual* codebase (verified file:line references throughout).
> It supersedes an earlier outside-in draft that incorrectly assumed Fastify and missed
> existing functionality.

## 1. Problem (the concrete pain)

The panel renders domains and mailboxes **only from its own SQLite DB** (`data.db`).
docker-mailserver (DMS) is the real source of truth for mail delivery, but entities created
directly in DMS via its `setup` CLI are invisible in the web UI, and panel rows can drift from
DMS. Observed: a domain and a mailbox added straight in DMS do **not** appear in the dashboard.

Today the only reconciliation is **mailboxes-only and partly destructive** (see §3) — there is no
way to import domains/DKIM, no review step, and no operator-controlled direction.

## 2. Goal

A **two-way reconciliation** feature: compute the divergence between DMS and the panel DB, present
it as a reviewable list, and let the operator **choose, per element, which direction to apply**
(import DMS→DB, push DB→DMS, or skip), **confirming before anything is written**. Nothing syncs
automatically. On-demand (button + API) first; an *optional* scheduled job behind a feature flag
may only ever **compute** a diff and notify — never auto-apply.

This is the model the user asked for: *двусторонняя синхронизация с подтверждением в обе стороны и
пер-элементным выбором.*

---

## 3. Codebase facts (verified) — reuse these, do not rebuild

**Framework / routing / DB**
- HTTP server is **Express 4** (`src/server.ts:1`, `package.json:37`) — **not** Fastify.
- DB is **better-sqlite3 + Drizzle**, single file, WAL. Schema in `src/db/schema.ts`. Migrations:
  `pnpm db:generate` → SQL in `drizzle/`, applied on startup (`src/db/migrate.ts`); tests use
  `:memory:`.
- **`db.transaction((tx) => …)` is SYNCHRONOUS** (better-sqlite3). Example:
  `src/domain/queue/repository.ts:59`. You **cannot** `await` inside it. See §6 (correctness).
- Admin router pattern: a factory `export function adminXRouter(deps) { const router = Router();
  router.get('/admin/api/x', …); return router }`, mounted in `src/server.ts` via
  `app.use(adminXRouter(...))`. Admin auth is applied once: `app.use('/admin/api', adminAuth)`
  (`src/server.ts:116`). **Mirror the api-keys router** at `src/http/routes/admin/apikeys.ts`
  (the cleanest, newest example) and its validator `src/http/validators/apikeys.ts`. Validation
  errors use the shared shape `{ error: 'Validation error', issues: [{ path, message }] }`.

**DMS integration (already exists — extend it)**
- `DmsClient` interface: `src/domain/mailboxes/dms-client.ts`. Impl: `DockerodeDmsClient`
  (`src/domain/mailboxes/dockerode-dms-client.ts`), via **dockerode**. Existing methods:
  `listEmails, addEmail, updatePassword, deleteEmail, setQuota, deleteQuota, generateDkim,
  readDkimPublicKey`. A private `runRaw(cmd[])` already runs arbitrary in-container commands
  (e.g. `cat`), so reading config files is feasible — just expose new methods.
- **Test double already exists:** `tests/helpers/fake-dms.ts` (`FakeDmsClient implements DmsClient`,
  in-memory, records `.calls`, can inject `.errors`). **Every new `DmsClient` method you add must
  also be implemented on `FakeDmsClient`.**

**DKIM (already exists — reuse)**
- BIND-format parser that reassembles split 255-char `p=` chunks: **`parseDkimFile(content)` →
  `{ selector, txtValue, publicKey }`** at `src/lib/dkim-parser.ts:22` (unit-tested incl. 4096-bit).
- Generation/storage: `DomainService.regenerateDkim()` (`src/domain/domains/service.ts:51`),
  columns `domains.dkimSelector`, `domains.dkimPublicKey`. Auto-DKIM behind flag
  `auto_dkim_enabled`.
- DNS validation (SPF/DKIM/DMARC): `DnsValidator` + `GET /admin/api/domains/:id/dns-check`.

**Feature flags / webhooks / workers / events**
- Flags live in a hardcoded registry `FLAG_DEFINITIONS` (`src/domain/feature-flags/registry.ts`),
  **snake_case** keys, unknown keys → 404, 30 s TTL cache. A new flag MUST be added to that list.
- `WEBHOOK_EVENTS` is a **closed const enum** (`src/db/schema.ts:128`); a new event type requires
  adding the literal there. `WebhookService.dispatch(event, payload)` (no-op if `webhooks_enabled`
  is off). Generic event dispatcher: `src/domain/events/types.ts` (`EventDispatcher.dispatch`).
- Background workers (`src/workers/{send,webhook}-worker.ts`, wired in `src/index.ts`): long-poll
  loop, **feature-flag gated**, **startup recovery** of stuck rows. This is the template for the
  optional scheduled diff job.

**Existing one-way sync to REPLACE**
- `POST /admin/api/mailboxes/sync` → `MailboxService.sync()` (`src/domain/mailboxes/service.ts:127`)
  currently: imports DMS mailboxes into DB *if a domain row already exists* (else marks
  `orphaned`), **auto-deletes** DB rows absent from DMS, updates `lastSyncedAt`. Its silent
  auto-delete **contradicts** this feature's "nothing auto-applies" rule. The new reconciliation
  **replaces** this endpoint; remove the destructive auto-delete (deletion becomes an explicit,
  double-confirmed resolution).

---

## 4. Reconciliation model (3 phases, operator-driven, no hardcoded source of truth)

1. **Preview** — read both sides, compute a list of **reconciliation items**, write nothing.
2. **Select** — operator picks a *resolution* per item (default `skip`).
3. **Apply** — execute only selected resolutions, after explicit confirm.

**Reconciliation item:**
- `entityType`: `domain | mailbox | alias | dkim`
- `key`: stable identity (mailbox/alias address; domain name; `domain/selector` for dkim)
- `dmsState` / `dbState`: value on each side (or `null` if absent)
- `divergence`: `only_in_dms | only_in_db | field_conflict`
- `availableResolutions` + `suggestedResolution`

**Resolutions (per element):**
- `import` — DMS → DB (create/update the DB row from DMS)
- `push` — DB → DMS (create/update in DMS via `DmsClient`)
- `field_pick` — for `field_conflict`: choose the winning side **per field**; both directions allowed
- `delete_db` / `delete_dms` — remove from the side where it exists (converge by deletion)
- `skip` — leave as-is (**default**)

**Confirmation rules:** every applied resolution must be explicitly selected; `delete_*` is
**destructive and double-confirmed** (a `confirmDeletes` flag in the apply request) and is never
implied by an `import`/`push` of another element. Unselected items default to `skip`, so an empty
selection is a no-op. No bulk auto-resolve. `field_conflict` is never auto-picked.

---

## 5. What to read from DMS

Reuse `DockerodeDmsClient`. Prefer the `setup ... list` CLI where it already exists; use
`runRaw`-backed file reads (new public methods) where it doesn't. Tolerate missing files across
DMS versions (§9).

| Entity | Source | New `DmsClient` method needed? |
|---|---|---|
| Mailboxes | `setup email list` (existing `listEmails()`) | no — already there |
| Quotas | `dovecot-quotas.cf` or `setup quota` | **yes** — `listQuotas()` (read-only enumeration) |
| Aliases | `postfix-virtual.cf` or `setup alias list` | **yes** — `listAliases()/addAlias()/deleteAlias()` |
| Domains | **derived**: union of mailbox + alias domains **and** DKIM key dirs | **yes** — `listDkimDomains()` (ls `opendkim/keys/`) |
| DKIM | `opendkim/keys/<domain>/<selector>.txt` (existing `readDkimPublicKey`) + key-dir listing | reuse `parseDkimFile`; add dir listing |

DMS has no "list domains" command — compute the domain set from the union above.
Password hashes from `postfix-accounts.cf` are **not** imported (auth is Dovecot's job; see §7).

---

## 6. Correctness constraint — async DMS vs sync DB transaction (READ THIS)

`apply` must do **async** DMS docker-exec (for `push` / `delete_dms`) *and* DB writes. Because
better-sqlite3 transactions are **synchronous**, you **cannot** wrap the whole `apply` in one
`db.transaction`. Required model:

- Run DMS operations **outside** any SQL transaction, sequentially, per selected item.
- Wrap the **DB-side** writes in a synchronous `db.transaction` (whole batch, or per item).
- **True DMS+DB atomicity is impossible.** On partial DMS failure, record exactly what applied and
  return a clear per-item error rather than leaving DB ahead of DMS. Order each item so the
  irreversible side (DMS) happens first, then mirror into DB — matching the existing
  `MailboxService.create()` pattern (DMS first, DB second, rollback DMS on DB failure).

---

## 7. Schema delta (Drizzle migration)

Already present — **do not duplicate**: `domains.dkimSelector`, `domains.dkimPublicKey`,
`mailboxes.quotaMb`, `mailboxes.lastSyncedAt`.

Add:
- `domains`: `source` enum `'panel' | 'dms'`, `last_synced_at` timestamp, `dkim_status` text
  (e.g. `ok | dns_republish_required | unknown`).
- `mailboxes`: `source` enum `'panel' | 'dms'`, `externally_managed` boolean.
  Store **no password hash** — panel rows are metadata; auth stays in Dovecot. Use
  `externally_managed` to mark DMS-origin mailboxes.
- **New table `aliases`** (none exists today): `id`, `address` (source), `target`, `domainId`
  (nullable FK), `source`, `lastSyncedAt`, `createdAt` — plus repository, service, validator,
  router, and a `postfix-virtual.cf` parser.
- Keep `created_at` stable on re-sync; only update mutable fields.

Generate with `pnpm db:generate`; commit the SQL under `drizzle/`.

---

## 8. Deliverables (real paths, repo conventions)

1. **`src/domain/sync/` module** (matches `src/domain/<area>/` convention, not `src/services/`):
   - `service.ts` — `SyncService` with:
     - `readDmsState()` → `{ domains, mailboxes, aliases, dkim }`
     - `readDbState()` → same shape from repositories
     - **`diff(dmsState, dbState)` → reconciliation items** — a **pure, unit-testable** function
       (no I/O), covering `only_in_dms | only_in_db | field_conflict`
     - `apply(resolutions, { confirmDeletes })` — executes selected items per §6, idempotent,
       emits an audit log line (`info`) per applied resolution `{ entityType, key, direction,
       result }`, dispatches events/webhook where relevant
   - `repository.ts` if it needs sync-state persistence (e.g. last run summary).
2. **Parsers** (pure, fixture-tested) in `src/lib/`:
   - `postfix-virtual.cf` (aliases) — new
   - `dovecot-quotas.cf` (quotas) — new
   - DKIM `mail.txt` — **reuse `parseDkimFile`** (`src/lib/dkim-parser.ts`); add only key-dir listing
3. **Extend `DmsClient`** (interface + `DockerodeDmsClient` + **`FakeDmsClient`**): `listAliases`,
   `addAlias`, `deleteAlias`, `listQuotas`, `listDkimDomains` (read-only enumeration via `runRaw`).
4. **API** — `src/http/routes/admin/sync.ts` (+ `src/http/validators/sync.ts`), mounted in
   `src/server.ts` after `app.use('/admin/api', adminAuth)`, mirroring the api-keys router:
   - `GET  /admin/api/sync/preview` → reconciliation-item list (§4), **no writes**. Return a
     per-item state snapshot (or hash) so apply can detect staleness **statelessly** — preferred
     over server-side preview storage (survives restarts / multiple tabs). A single `previewId`
     wrapping a diff-hash is an acceptable alternative if you prefer.
   - `POST /admin/api/sync/apply` → body `{ resolutions: [{ key, entityType, resolution, fields? }],
     confirmDeletes?: boolean }`. Applies **only** the listed resolutions; **rejects if any selected
     item's current state differs from what was previewed** (re-preview required); **rejects any
     `delete_*` unless `confirmDeletes` is true**. Returns per-item result (applied/failed/skipped).
   - `GET  /admin/api/sync/status` → last run timestamp + summary counts.
5. **UI** — a "Sync with mail server" section (Settings). The generic `ResourceTable` does **not**
   fit (it's single-entity CRUD); build a **bespoke review table**: one row per element showing both
   sides + divergence + a **per-row direction control** (`import ← DMS` / `push → DMS` / per-field
   pick / `delete` / `skip`), select-all-of-type helpers, and an **Apply selected** button. `delete_*`
   rows require ticking a confirm box. Show `last_synced_at`. Stack: React 18 + Vite + Tailwind v4 +
   TanStack Query (as existing pages).
6. **Optional background job** behind a **`sync_preview_notify`** flag (snake_case, added to
   `FLAG_DEFINITIONS`, default **off**): follow the `send-worker`/`webhook-worker` template
   (long-poll, flag-gated, startup recovery). It **computes a diff and notifies** (log; or webhook
   via a new `sync.divergence_detected` event added to `WEBHOOK_EVENTS`) when divergence exists —
   and **never applies**.

---

## 9. Behavior, conflict & edge rules

- **Idempotent:** empty selection writes nothing; a full preview after a full apply shows no
  remaining divergence for applied items.
- **Stale-preview guard:** apply must operate against previewed state; if either side changed since
  preview, reject and require re-preview.
- **`field_conflict`:** never auto-pick; operator chooses direction (or per field). Until chosen → `skip`.
- **DKIM divergence:** surface as `field_conflict`. Whichever side is picked, **do not touch DNS** —
  sync only moves key material between DMS and DB. If the chosen DKIM differs from what's published,
  set `dkim_status = dns_republish_required` to warn the operator. (DKIM regeneration stays a
  separate domain action — sync only reads.)
- **`delete_*`:** destructive, per-element, double-confirmed; never implied by another item.
- **`postmaster@` / system mailboxes:** appear as normal items; no special-case auto-delete.
- **All DMS writes** go through `DmsClient` (docker-exec; socket access already configured on host).
- **Edge cases:** missing DMS files across versions → tolerate, prefer `setup` CLI fallback; mailbox
  in DMS with no domain row → create the domain item first (don't mark `orphaned` and drop it);
  alias pointing at a non-existent target → surface, don't crash; fresh/empty DMS → empty diff, no
  error; concurrent sync runs → guard with a simple in-process lock (single Node process).

---

## 10. Safety / non-goals

- No automatic application in any direction; every write is operator-selected and confirmed,
  `delete_*` double-confirmed.
- Never store or log plaintext passwords or `SESSION_SECRET`; do not import password hashes.
- Do not regenerate DKIM keys here; do not modify DNS zones.
- DB-side writes are transactional; cross-DMS atomicity is best-effort with clear partial-failure
  reporting (§6).

---

## 11. Tests (Vitest + Supertest, mirror existing layout)

- **Unit** (`tests/unit/`): the new parsers (fixtures for `postfix-virtual.cf`, `dovecot-quotas.cf`;
  reuse existing DKIM fixtures), and **`diff()`** → reconciliation items for every branch
  (`only_in_dms`, `only_in_db`, `field_conflict`, no-divergence). `diff()` must be pure.
- **Integration** (`tests/integration/`, using `tests/helpers/db.ts` + `createTestApp` +
  **`FakeDmsClient`**): `GET /sync/preview` shape; `POST /sync/apply` applying **one item per
  direction** (import, push) and asserting only those wrote (assert via `FakeDmsClient.calls` and DB
  rows); `delete_*` rejected without `confirmDeletes`; stale state rejected; empty selection is a
  no-op. Wire `FakeDmsClient` into the test app the same way the mailboxes integration tests do.

---

## 12. Acceptance criteria

1. With a domain + mailbox created directly in DMS (the current pain), `GET /sync/preview` returns
   them as `only_in_dms` items (domain + mailbox + its DKIM), **writing nothing**; the dashboard
   shows them under Sync for review.
2. Operator selects `import` for chosen items and applies → those (and only those) appear in the
   panel; unselected items stay divergent; `GET /sync/status` shows the run.
3. A panel-created-but-undelivered mailbox shows as `only_in_db` and can be **pushed → DMS** when
   selected; a stray element converges via an explicit, double-confirmed `delete_*`.
4. `field_conflict` (incl. DKIM) is never auto-resolved; the chosen direction applies, DNS is never
   touched, and DKIM divergence sets `dkim_status = dns_republish_required`.
5. Apply with an empty selection is a no-op; apply against stale state is rejected.
6. `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` all green; new migration committed
   under `drizzle/`.

---

## 13. Suggested delivery phases

The model is "full two-way sync", but ship it in reviewable slices:

1. **Phase 1 — core (domains + mailboxes):** replace `MailboxService.sync()` with the `diff()`
   engine + `/sync/preview` + `/sync/apply` (`import`/`push`/`skip` + stale guard), create domain
   rows, schema migration (`source`, `last_synced_at`, `dkim_status`), audit log, bespoke UI table.
   **This already fixes the reported pain** (DMS-created domain/mailbox become importable).
2. **Phase 2 — DKIM `field_conflict` + `delete_*`** (double-confirm, "DNS must be re-published").
3. **Phase 3 — aliases (new table + DmsClient + parser + UI)** and the optional
   `sync_preview_notify` background diff/notify job.

---

*Origin: prod investigation (panel `data.db` empty while DMS held mailboxes + DKIM created via CLI).
Rewritten against the actual `mailserver-api` codebase on 2026-06-24.*
