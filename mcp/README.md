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

## Tools (29)

- **Send:** `send_email`, `get_send_job`, `list_send_jobs`
- **Domains:** `list_domains`, `create_domain`, `generate_dkim`, `dns_check`
- **Mailboxes:** `list_mailboxes`, `create_mailbox`, `set_mailbox_password`, `delete_mailbox`
- **Aliases:** `list_aliases`, `create_alias`, `delete_alias`
- **SMTP accounts:** `list_smtp_accounts`, `create_smtp_account`, `delete_smtp_account`
- **API keys:** `list_api_keys`, `create_api_key`, `revoke_api_key`
- **Webhooks:** `list_webhooks`, `create_webhook`, `test_webhook`, `delete_webhook`
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
