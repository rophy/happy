# CLAUDE.md

## Docker Compose

### Services

- **server** — standalone happy-server with embedded PGlite (no external DB needed)
- **webapp** — Expo web app served via nginx
- **nginx** — reverse proxy on port 8333, hostname-based routing

### Quick Start

```bash
docker compose up --build -d
```

This exposes port **8333**. By default:
- Any hostname → webapp
- `api.*` hostname → server API

### Production Setup

Requires two DNS records pointing to the same host:

| Domain | Purpose |
|--------|---------|
| `example.com` | Webapp (browser UI) |
| `api.example.com` | Server API |

Update `nginx.conf` `server_name` to match your API domain:

```nginx
server_name api.example.com;
```

Then build with the server URL baked into the webapp:

```bash
HAPPY_SERVER_URL=https://api.example.com docker compose up --build -d
```

Users configure `https://api.example.com` as the custom server URL in the webapp's Server Configuration page (`/server`).

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `HANDY_MASTER_SECRET` | Yes | Master secret for auth/encryption |
| `HAPPY_SERVER_URL` | No | Baked into webapp at build time (API endpoint URL) |
| `POSTHOG_API_KEY` | No | PostHog analytics |
| `REVENUE_CAT_STRIPE` | No | RevenueCat billing |

### Data Persistence

Server data (PGlite database, local files) is stored in the `server-data` docker volume mounted at `/data`.
