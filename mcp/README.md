# mailserver-mcp

An [MCP](https://modelcontextprotocol.io) server that exposes the **mail-api** control
plane as tools, so an AI agent (Claude Desktop, Claude Code, IDEs) can send mail and
manage domains, mailboxes, aliases, DKIM, SMTP accounts, API keys, webhooks, feature
flags, and run the DMS↔DB sync.

It is a thin **stdio** wrapper over the existing REST API — it authenticates with an
`X-Api-Key` and makes no direct DB/DMS access. The key's scopes are the agent's ceiling
of permissions.

## Build

```bash
cd mcp
pnpm install
pnpm build        # → dist/index.js
```

## Configure

Two env vars:

| Var | Default | Notes |
|---|---|---|
| `MAIL_API_URL` | `http://localhost:3050` | Base URL of mail-api (e.g. `https://mail-admin.example.com`). |
| `MAIL_API_KEY` | (required) | A mail-api key. For the full tool set use a key with **both** `admin` and `send` scopes. |

Mint a key:

```bash
cd ../mailserver-api
pnpm create-api-key --name=mcp --scopes=send,admin   # plaintext shown once
```

## Use with Claude Code

```bash
claude mcp add mailserver \
  --env MAIL_API_URL=https://mail-admin.example.com \
  --env MAIL_API_KEY=<key> \
  -- node /absolute/path/to/mcp/dist/index.js
```

## Use with Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mailserver": {
      "command": "node",
      "args": ["/absolute/path/to/mcp/dist/index.js"],
      "env": {
        "MAIL_API_URL": "https://mail-admin.example.com",
        "MAIL_API_KEY": "<key>"
      }
    }
  }
}
```

## Tools (70)

- **Send:** `send_email`, `get_send_job`, `list_send_jobs`
- **Domains:** `list_domains`, `get_domain`, `create_domain`, `update_domain`, `delete_domain`, `generate_dkim`, `dns_check`
- **Mailboxes:** `list_mailboxes`, `get_mailbox`, `create_mailbox`, `update_mailbox`, `set_mailbox_password`, `delete_mailbox`, `get_mailbox_sieve`, `set_mailbox_sieve`
- **Aliases:** `list_aliases`, `create_alias`, `delete_alias`
- **Quarantine:** `list_quarantine`, `release_quarantine`, `delete_quarantine`
- **Suppression:** `list_suppressions`, `add_suppression`, `remove_suppression`
- **Bounces:** `list_bounces`, `ingest_bounce`
- **Access lists:** `list_access_rules`, `create_access_rule`, `delete_access_rule`
- **SMTP accounts:** `list_smtp_accounts`, `create_smtp_account`, `update_smtp_account`, `delete_smtp_account`
- **API keys:** `list_api_keys`, `create_api_key`, `set_api_key_policy`, `revoke_api_key`
- **Webhooks:** `list_webhooks`, `create_webhook`, `update_webhook`, `test_webhook`, `list_webhook_deliveries`, `delete_webhook`
- **Users:** `list_users`, `create_user`, `set_user_role`, `delete_user`
- **Provisioning:** `import_bulk`
- **Migrations:** `list_migrations`, `get_migration`, `create_migration`
- **Fetchmail:** `list_fetchmail`, `create_fetchmail`, `delete_fetchmail`
- **Observability:** `get_engine_overview`, `restart_container`, `get_mail_logs`, `get_mail_queue`, `get_sessions`, `get_stats`
- **Backups:** `list_backups`, `create_backup`
- **Feature flags:** `list_feature_flags`, `set_feature_flag`
- **DMS↔DB sync:** `sync_preview`, `sync_status`, `sync_apply`

Read-only tools are marked `readOnlyHint`; destructive ones (`delete_*`, `revoke_*`,
`sync_apply`) are marked `destructiveHint` so the host can prompt for confirmation.
`sync_apply` additionally requires `confirmDeletes: true` for any `delete_*` resolution,
and uses the `stateHash` values returned by `sync_preview` to reject stale previews.

## Develop

```bash
MAIL_API_KEY=<key> pnpm dev    # tsx watch
pnpm typecheck
```
