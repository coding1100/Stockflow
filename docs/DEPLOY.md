# Deploying StockFlow on a single VPS (Docker Compose)

The app needs four things running together: **Postgres**, **Redis**, the **web** app, and the
**worker** (the materializer that keeps inventory live + background jobs). One small server runs
all of it. You front the web container with **your own nginx** (TLS via certbot), or use the
bundled Caddy for automatic HTTPS.

## 0. Server prerequisites
- A Linux VPS (2 vCPU / 2–4 GB RAM is plenty to start).
- Docker Engine + Compose plugin installed.
- A domain with an A record pointing at the server (for HTTPS).

## 1. Get the code + configure
```bash
git clone <your-repo> stockflow && cd stockflow
cp infra/.env.deploy.example infra/.env.deploy
```
Edit `infra/.env.deploy`:
- `POSTGRES_PASSWORD` — a strong password (also reflected inside `DATABASE_URL`).
- `NEXTAUTH_SECRET` — `openssl rand -base64 48`.
- `NEXTAUTH_URL` — your public URL, e.g. `https://retail-automation.infosoftco.com`.
- Leave `DEMO_ORDER_DRIP=off` for production.

> `DATABASE_URL` host is `postgres` and `REDIS_URL` host is `redis` — those are the internal
> compose service names, not localhost.

## 2. Build + start
```bash
docker compose -f infra/docker-compose.full.yml --env-file infra/.env.deploy up -d --build
```
What happens: Postgres + Redis come up → the **migrate** service applies all DB migrations and
exits → **web** (on `127.0.0.1:3000`) and **worker** start. Check with:
```bash
docker compose -f infra/docker-compose.full.yml ps
docker compose -f infra/docker-compose.full.yml logs -f web worker
```

## 3. Reverse proxy + HTTPS — pick one

**A) Your nginx (recommended since you run it already)**
- Copy `infra/nginx.conf` to `/etc/nginx/sites-available/stockflow`, set `server_name`, enable it.
- Get a cert: `sudo certbot --nginx -d retail-automation.infosoftco.com`.
- The `/api/stream/` block disables buffering — **required** so live updates (SSE) stream in real
  time. Make sure the `map $http_upgrade $connection_upgrade {…}` line is in your `http{}` block.
- `sudo nginx -t && sudo systemctl reload nginx`.

**B) Bundled Caddy (zero-config TLS)**
```bash
docker compose -f infra/docker-compose.full.yml --env-file infra/.env.deploy --profile tls up -d
```
Caddy reads `DOMAIN` from the env file, fetches a Let's Encrypt cert, and proxies to web. (If you
use Caddy, remove the `127.0.0.1:3000` host publish or just leave it — Caddy reaches web over the
internal network.)

## 4. (Optional) seed starter data
Production normally gets data from the ERP/order feed, not the demo seed. If you want sample data
in a fresh staging environment:
```bash
docker compose -f infra/docker-compose.full.yml --env-file infra/.env.deploy \
  run --rm migrate pnpm db:seed
```

## Updating to a new version
```bash
git pull
docker compose -f infra/docker-compose.full.yml --env-file infra/.env.deploy up -d --build
```
Migrations run automatically (the migrate step) before web/worker restart.

## Operating notes
- **Backups:** snapshot the `pgdata` volume (or `pg_dump`) on a schedule — it's your source of truth.
- **Logs:** `docker compose ... logs -f`. Set `SENTRY_DSN` in the env file to ship errors to Sentry.
- **Restarts:** all services use `restart: unless-stopped`, so they survive reboots.
- **Scaling later:** when volume grows, enable the documented hardening — DB-level row-level
  security and monthly partitioning of the `transactions` table (see
  `packages/db/prisma/migrations/*_search_and_rls`), and consider moving Postgres/Redis to managed
  services.
- **Two always-on processes:** never run web/worker on serverless (Vercel/Lambda) — the SSE
  connections and the Redis-stream materializer must stay alive. This VPS setup keeps them up.
