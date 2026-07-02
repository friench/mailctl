# docker-mailserver cheat sheet

Day-to-day commands for the underlying `docker-mailserver` container. mail-api wraps most of these via the dashboard or `/admin/api/*`; use these when you need to do something the UI doesn't expose yet.

All commands run inside the `mailserver` container.

## Help

```bash
docker exec -it mailserver setup help
```

## Mailboxes

```bash
# List
docker exec -it mailserver setup email list

# Add (interactive password prompt, or pass as 2nd arg for scripted)
docker exec -it mailserver setup email add user@example.com

# Update password
docker exec -it mailserver setup email update user@example.com

# Delete (skip confirmation with -y)
docker exec -it mailserver setup email del -y user@example.com
```

## Aliases

```bash
docker exec -it mailserver setup alias list
docker exec -it mailserver setup alias add alias@example.com target@example.com
docker exec -it mailserver setup alias del alias@example.com
```

## Quotas

```bash
docker exec -it mailserver setup quota set user@example.com 1G
docker exec -it mailserver setup quota list
docker exec -it mailserver setup quota del user@example.com
```

## DKIM

```bash
# Generate key for a domain
docker exec -it mailserver setup config dkim domain example.com

# Public key (paste into DNS as a TXT record on `mail._domainkey.example.com`):
cat docker-data/dms/config/opendkim/keys/example.com/mail.txt
```

## Logs

```bash
docker exec mailserver tail -f /var/log/mail/mail.log
```

## Reconcile mail-api with DMS state

If you ran `setup email add` directly (not through the UI), run sync to mirror it into mail-api's DB:

```bash
curl -X POST https://<api-host>/admin/api/mailboxes/sync \
  -H "X-Api-Key: <admin-key>"
# → { added: [...], removed: [...], matched: [...], orphaned: [...] }
```
