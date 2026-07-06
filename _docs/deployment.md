# Deployment

Generic guide to bring up the whole stack on a fresh server. Replace `example.com` with your own domain.

## Prerequisites

- Linux server with Docker + Docker Compose v2
- Public IPv4 + DNS A record `mail.example.com` → server IP
- Optional: PTR (reverse DNS) `serverIP → mail.example.com` (improves deliverability)
- Outbound port 25 open (some VPS providers block it; ask support)

> **Already running Dokploy?** Skip sections 1–2 and follow the [Alternative: Dokploy](#alternative-deploying-with-dokploy) path, then come back to section 3.

## 1. Clone and configure

```bash
git clone https://github.com/friench/mailctl.git mailctl
cd mailctl

# Root: docker-mailserver settings
cp .env.example .env
$EDITOR .env  # set MAIL_HOSTNAME, OVERRIDE_HOSTNAME, POSTMASTER_ADDRESS, TZ

# nginx-certbot: who gets renewal failure emails
cp nginx/nginx-certbot.env.example nginx/nginx-certbot.env 2>/dev/null || \
  echo "CERTBOT_EMAIL=admin@example.com" > nginx/nginx-certbot.env

# mail-api: control plane
cp mailserver-api/.env.example mailserver-api/.env
$EDITOR mailserver-api/.env
```

In `mailserver-api/.env` set at minimum:

```bash
SESSION_SECRET=$(openssl rand -hex 32)
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=$(openssl rand -hex 16)
```

(Or leave `INITIAL_ADMIN_*` empty and use `pnpm create-admin` after first start.)

## 2. Bring up the stack

```bash
# First-time only: external volume that nginx + mailserver share for certs
docker volume create nginx_nginx_secrets

# Build the mail-api image (UI gets bundled into it)
docker compose build mail-api

# Start everything
docker compose up -d
```

Check logs:

```bash
docker compose logs -f mail-api
docker compose logs -f nginx
docker compose logs -f mailserver
```

The first `docker compose up` triggers nginx-certbot to acquire a Let's Encrypt cert for `mail.example.com`. Wait until you see `successfully renewed certificate` in the nginx logs.

## 3. Configure your first domain via the UI

1. Open `https://<your-control-plane-host>/admin/login`. You can either point a domain at the server and add a vhost in `nginx/user_conf.d/api.conf`, or for first-time setup `ssh -L 3050:localhost:3050 …` and use `http://localhost:3050/admin/login`.
2. Sign in with `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD`.
3. **Domains** → "New" → add `example.com` (and a DKIM selector like `mail`). mail-api writes `nginx-generated/mail-example-com.conf`; nginx picks it up and certbot acquires a cert.
4. **SMTP accounts** → "New" → fill in the outbound credentials. For mail-api to send through the local docker-mailserver, host = `mailserver`, port = 587, no TLS. Add the credentials' env-var names (e.g. `MAIL_USER_NOREPLY`, `MAIL_PASS_NOREPLY`) and put the actual values in `mailserver-api/.env` then restart `mail-api`.
5. **Mailboxes** → "New" → add `noreply@example.com` with a password. mail-api invokes `docker exec mailserver setup email add …` for you and stores a mirror row.
6. **API keys** → "New" → with scope `send` for application use. Save the plaintext key — it is shown only once.

## 4. Send a test email

```bash
curl -X POST https://<api-host>/send \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: <your-key>" \
  -d '{
    "to": "you@elsewhere.com",
    "subject": "It works",
    "html": "<p>Hello from mail-api.</p>"
  }'
# → 202 { "ok": true, "id": "<jobId>", "status": "pending" }

curl -H "X-Api-Key: <your-key>" https://<api-host>/jobs/<jobId>
# → poll until status: "done"
```

## 5. (Recommended) DNS records for deliverability

After step 3 the domain is registered, but for outbound mail to actually be accepted you also need:

| Record | Value |
|---|---|
| `mail.example.com` A | `<server IP>` |
| `example.com` MX | `10 mail.example.com.` |
| `example.com` TXT (SPF) | `v=spf1 mx -all` |
| `mail._domainkey.example.com` TXT (DKIM) | content of `docker-data/dms/config/opendkim/keys/example.com/mail.txt` after running `docker exec mailserver setup config dkim` |
| `_dmarc.example.com` TXT (DMARC) | `v=DMARC1; p=quarantine; rua=mailto:postmaster@example.com` |

A brand-new domain/IP with perfect SPF/DKIM/DMARC will still often land in **spam** at first — that is sender reputation (cold start), not a config bug. Levers: mark "not spam" / reply / add to contacts (fastest for your own inbox), send real content (not `test`), warm up volume gradually, and register the domain in [Google Postmaster Tools](https://postmaster.google.com) (one apex `google-site-verification=…` TXT). Confirm the IP is not on a DNSBL (`zen.spamhaus.org`, `b.barracudacentral.org`, …) and that PTR/FCrDNS resolves to `${MAIL_HOSTNAME}`.

### (Optional) MTA-STS + TLS-RPT

Maturity signals: MTA-STS tells sending servers your MX **requires** valid TLS; TLS-RPT collects TLS-failure reports. **MTA-STS is per recipient-domain** and needs a policy served over HTTPS at `https://mta-sts.<domain>/.well-known/mta-sts.txt` (valid public cert).

DNS (per domain):

```text
mta-sts.<domain>      A     <server IP>
_mta-sts.<domain>     TXT   "v=STSv1; id=<bump-on-every-policy-change>"   # id e.g. 20260623T131602
_smtp._tls.<domain>   TXT   "v=TLSRPTv1; rua=mailto:postmaster@<domain>"
```

Policy file (`Content-Type: text/plain`, CRLF line endings):

```text
version: STSv1
mode: testing          # start here; raise to `enforce` after TLS-RPT shows no failures
mx: mail.example.com
max_age: 604800
```

On Dokploy, keep the generic mail stack domain-agnostic by serving the policy from a **tiny standalone app** rather than baking it into `docker-compose.dokploy.yml`: a raw-compose `nginx:alpine` app whose command writes the policy to `/usr/share/nginx/html/.well-known/mta-sts.txt`, with a Traefik `Host(\`mta-sts.<domain>\`)` + `tls.certresolver` router on the `dokploy-network`. Whenever you change the policy (e.g. `testing` → `enforce`), edit the file **and** bump the `id=` in the `_mta-sts` TXT.

## 6. Production hardening

| Concern | Recommendation |
|---|---|
| `docker.sock` access | The default `docker-compose.yml` now routes all Docker API calls through a least-privilege **`tecnativa/docker-socket-proxy`** (`CONTAINERS`/`EXEC`/`POST`/`ALLOW_RESTARTS` only; raw socket mounted read-only into the proxy, on an `internal` network). mail-api reaches it via `DOCKER_HOST=tcp://docker-socket-proxy:2375` and no longer mounts the socket — so a mail-api compromise can't drive arbitrary host containers/images. To fall back to the direct socket, unset `DOCKER_HOST` and mount `/var/run/docker.sock` (mail-api then needs the host docker group, `group_add: ["${DOCKER_GID:-983}"]`). |
| Backups | `sqlite3 mailserver-api/data/data.db ".backup mailserver-api/data/data.db.bak"` daily; copy `docker-data/dms/mail-data/` for actual mail. |
| Login brute-force | Built-in: 5 logins/min/IP. For higher-quality protection add Cloudflare or Crowdsec. |
| Trust proxy | mail-api sets `app.set('trust proxy', TRUST_PROXY)` so `req.ip` reflects the real client. Default is `1` in the bundled docker-compose (one nginx hop). |
| Healthchecks | mail-api Dockerfile has `HEALTHCHECK` on `/health`. |
| Rotating webhook secrets | Delete and recreate the webhook (the secret is shown only at creation time). |

## 7. Upgrades

```bash
git pull
docker compose build mail-api
docker compose up -d
# migrations run automatically on container start
```

Schema migrations are forward-only and idempotent; rolling back requires a DB restore.

## Alternative: Deploying with Dokploy

If your server already runs [Dokploy](https://dokploy.com), reuse its Traefik + Let's Encrypt instead of the bundled `nginx-certbot`. The repo ships a Dokploy-ready stack:

- `docker-compose.dokploy.yml` — replaces the root `docker-compose.yml`. No nginx service; mail-api carries Traefik labels.
- `.env.dokploy.example` — single env file for both services (replaces root `.env` + `mailserver-api/.env`).

### What's different vs the standalone stack

| Concern | Standalone | Dokploy |
|---|---|---|
| HTTP/HTTPS termination | `nginx-certbot` (ports 80/443) | Dokploy's Traefik |
| TLS cert acquisition | certbot inside nginx | Traefik cert resolver. A `traefik-certs-dumper` sidecar in this stack extracts PEM files from Traefik's `acme.json` and feeds them to `docker-mailserver`. |
| Per-domain vhost generation | mail-api writes `nginx-generated/*.conf` | **Disabled** (`NGINX_RELOAD_ENABLED=false`). Tenant subdomains live as separate Dokploy apps if you need them. |
| Persistent state | Bind mounts under `docker-data/` and `mailserver-api/data/` | Named volumes (snapshotted by Dokploy) |
| Env files | Two (`.env`, `mailserver-api/.env`) | One stack-level `.env` |

### One-time DNS prep

```text
mail.example.com         A   <server IP>     # MAIL_HOSTNAME — for SMTP/IMAP cert + PTR
mail-admin.example.com   A   <server IP>     # ADMIN_HOSTNAME — for the dashboard
```

A records must exist **before** the first deploy so Traefik's HTTP-01 challenge succeeds.

### Find Traefik's network and acme.json path

The Dokploy compose uses one external network and reads Traefik's `acme.json` directly from the host (Dokploy keeps it as a bind-mounted file, not a Docker volume):

```bash
docker network ls | grep -i dokploy        # default: dokploy-network
docker exec dokploy-traefik cat /etc/traefik/traefik.yml | grep -A2 certificatesResolvers
#                                          # default cert resolver name: letsencrypt

# Confirm where Dokploy stores acme.json (default for fresh installs):
sudo ls -l /etc/dokploy/traefik/dynamic/acme.json
# If yours is elsewhere:
docker inspect dokploy-traefik --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}' | grep acme
```

### Create the Dokploy app

1. **New → Compose** in the Dokploy UI.
2. Connect this Git repo (or upload it).
3. Set the **Compose file** path to `docker-compose.dokploy.yml`.
4. Open the **Environment** editor and paste the contents of `.env.dokploy.example`. Fill in:
   - `MAIL_HOSTNAME`, `ADMIN_HOSTNAME`, `POSTMASTER_ADDRESS`
   - `SESSION_SECRET=$(openssl rand -hex 32)`
   - `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` (or create the admin later via `pnpm create-admin`)
   - `TRAEFIK_NETWORK`, `TRAEFIK_CERT_RESOLVER`, `TRAEFIK_ACME_PATH` — from the discovery commands above
   - `DOCKER_GID` — the GID that owns `/var/run/docker.sock` (`stat -c '%g' /var/run/docker.sock`; default `983`). mail-api runs as a non-root user and needs this group to `docker exec` into the mailserver for mailbox/DKIM provisioning. Without it every such op fails with `EACCES`.
5. Click **Deploy**.

The compose file ships two Traefik routers on `mail-api`:

- `mail-api` → `https://${ADMIN_HOSTNAME}/admin/` — the dashboard.
- `mail-cert` → `https://${MAIL_HOSTNAME}/` — a no-op router whose only job is to make Traefik request a cert for the SMTP/IMAP hostname. Hits to that URL hit the same `mail-api` 401, which is harmless.

### First-boot order

Two things can keep the stack from settling on the very first deploy:

**1. `docker-mailserver` needs at least one mailbox.** With `ACCOUNT_PROVISIONER=FILE`, Dovecot refuses to start until an account exists. The container logs `You need at least one mail account to start Dovecot (Ns left ...)` and then loops (shutdown → restart), so ports 25/465/587/993 never open. Create the first mailbox to break the loop — the postmaster mailbox is the natural choice (RFC 5321 requires it anyway):

```bash
docker exec mailserver setup email add postmaster@example.com '<password>'
# then reconcile the panel's mirror DB:
#   POST https://${ADMIN_HOSTNAME}/admin/api/mailboxes/sync
```

> Provisioning from the **dashboard** (Domains → New, then Mailboxes → New) does the same thing — but only once `DOCKER_GID` is set (see step 4), otherwise the panel's `docker exec` fails with `EACCES`. The direct command above works regardless and is handy for the very first bootstrap.

Within one restart cycle Dovecot starts and all four ports begin listening.

**2. TLS cert timing.** `mail-api` goes healthy almost immediately. The `traefik-certs-dumper` sidecar materialises the PEMs into the `mail_certs` volume as soon as Traefik issues the cert for `${MAIL_HOSTNAME}` (triggered by the `mail-cert` router, usually <30 s — visible in Traefik logs as `Adding certificate for domain(s) mail.example.com`). If `mailserver` happened to start before the PEMs existed (`SSL_TYPE=letsencrypt` can't find `live/${MAIL_HOSTNAME}/fullchain.pem`), restart it once:

```bash
docker restart mailserver
```

From then on it stays up.

### How TLS certs reach docker-mailserver

`docker-mailserver` with `SSL_TYPE=letsencrypt` expects PEM files at `/etc/letsencrypt/live/${MAIL_HOSTNAME}/{fullchain,privkey}.pem`, but Traefik on Dokploy stores everything in a single `acme.json`. The compose ships a `traefik-certs-dumper` sidecar (image `ldez/traefik-certs-dumper`) that:

1. Bind-mounts `${TRAEFIK_ACME_PATH}` read-only into the container.
2. Watches the file for changes.
3. Writes `/output/${DOMAIN}/{fullchain,privkey}.pem` into the named volume `mail_certs`.

`mailserver` mounts that same `mail_certs` volume read-only at `/etc/letsencrypt/live`, so once Traefik issues a cert for `${MAIL_HOSTNAME}` (triggered by the `mail-cert` router), the dumper materialises it into the path docker-mailserver expects.

Useful checks if mail TLS still fails:

```bash
# Did Traefik record a cert for the mail hostname?
sudo jq '.letsencrypt.Certificates[].domain' /etc/dokploy/traefik/dynamic/acme.json

# Did the dumper write PEMs?
docker exec mail-certs-dumper ls /output/${MAIL_HOSTNAME}/

# Does mailserver see them?
docker exec mailserver ls /etc/letsencrypt/live/${MAIL_HOSTNAME}/
```

### Multi-tenant domains (e.g. itpuls.ru + ipsag.ru + …)

You only deploy **one** mail server. All tenant domains share `mail.itpuls.ru` (or whichever you chose for `MAIL_HOSTNAME`). For each tenant domain:

```text
<tenant>.                MX 10  ${MAIL_HOSTNAME}.
<tenant>.                TXT    "v=spf1 mx -all"
mail._domainkey.<tenant> TXT    <output of POST /admin/api/domains/:id/dkim>
_dmarc.<tenant>.         TXT    "v=DMARC1; p=quarantine; rua=mailto:dmarc@<tenant>"
```

Add the domain via **Dashboard → Domains → New**, click **Generate DKIM**, copy the TXT into your DNS, then run **DNS check** to confirm all five records are green. No additional Traefik routing is required for mail to flow.

### Continue with section 3

Once the stack is up and healthy, the rest of this guide (sections 3 onward) applies as written — the dashboard URL, the `/send` API, DNS hardening, and operational runbooks are identical regardless of whether you used the standalone or Dokploy path.
