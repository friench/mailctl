# `POST /send`: attachments, replyTo, text

Reference for the optional fields the send pipeline accepts beyond the original
`{ from, to, subject, html }`. Shipped 2026-06-22 (PR #6). Driver: the HiredCraft
*Initiativbewerbung* use case — emails that carry a CV PDF (Lebenslauf), a candidate
Reply-To, and a plain-text alternative for deliverability.

All three fields are **optional and fully backward-compatible**: a request with only
`{ to, subject, html }` behaves exactly as before, and old queued jobs (no new fields)
still process.

## Request contract

| Field | Type | Notes |
|---|---|---|
| `text` | string | Plain-text alternative to `html`. |
| `replyTo` | string | `Reply-To` address; validated against the email regex. |
| `attachments` | array | ≤ **10 files**, ≤ **10 MB** total (approx decoded size). |

Each `attachments` item:

```jsonc
{ "filename": string, "content": "<base64>", "contentType"?: string }
```

- `content` must be **canonical, whitespace-free base64** (validated by a round-trip:
  `Buffer.from(s,'base64').toString('base64') === s`).
- `filename` must not contain path separators (`/` or `\`), max 255 chars.
- `contentType` is optional (max 128 chars); nodemailer infers from `filename` if omitted.
- Total cap is the sum of `Math.floor(content.length * 3 / 4)` across items, ≤ 10 MB.

Example:

```bash
curl -X POST https://<api-host>/send \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: <key>" \
  -d '{
    "to": "user@example.com",
    "subject": "Ihre Bewerbung",
    "html": "<p>Anbei mein Lebenslauf.</p>",
    "text": "Anbei mein Lebenslauf.",
    "replyTo": "bewerber@example.com",
    "attachments": [
      { "filename": "lebenslauf.pdf", "content": "JVBERi0xLjcK...", "contentType": "application/pdf" }
    ]
  }'
```

## Implementation

| Concern | Location |
|---|---|
| Validation (`attachmentSchema`, `isBase64`, `totalDecodedBytes`) | `mailserver-api/src/http/validators/send.ts` |
| Payload shape (`SendJobPayload`) | `mailserver-api/src/db/schema.ts` |
| Route → enqueue (omits unset fields) | `mailserver-api/src/http/routes/send.ts` |
| Worker → mailer call | `mailserver-api/src/domain/queue/service.ts` |
| `MailSender.send(input)` → nodemailer | `mailserver-api/src/domain/send/mailer.ts` |

Key design points:

- **No DB migration.** The new fields ride inside the existing `send_jobs.payload`
  JSON column. Attachments persist as base64 strings (not Buffers), so a job survives
  being written to SQLite and re-read by the worker after a crash/restart.
- `MailSender.send` takes an **options object** (`{ to, subject, html, from?, text?,
  replyTo?, attachments? }`) and forwards attachments to nodemailer with
  `encoding: 'base64'`. The priority-failover/transient-retry loop and `validateFrom`
  are unchanged.

## Tests

- `tests/unit/send-validator.test.ts` — accepts valid attachments; rejects >10 files,
  >10 MB total, non-base64 `content`, `filename` with `/` or `\`, invalid `replyTo`.
- `tests/integration/send.integration.test.ts` — payload round-trips the new fields;
  backward-compat (minimal body → payload has no extra keys); rejects bad attachments.
- `tests/unit/mailer.test.ts` — `send({...})` forwards `text`/`replyTo`/`attachments`
  to a mocked `sendMail`, and omits them when not provided.

## Out of scope

- Inbound/IMAP reading (handled by the consumer).
- Attachment storage/dedup — base64-in-payload is sufficient at pilot volume
  (≤20 emails/candidate).
- Dashboard UI changes.
