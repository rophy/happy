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

### CLI Testing

The `cli` service runs happy-cli in a container with Claude Code pre-installed. It uses a `cli` profile so it won't start with `docker compose up`.

**First-time setup** (authenticate):

```bash
docker compose run --rm -it cli "happy auth login"
```

This shows a URL like `https://web.../terminal/connect#key=...`. Open it in a browser where you have already created an account on the webapp, then click "Accept Connection". The CLI must be running while you accept.

**Start a session:**

```bash
docker compose run --rm -it cli
```

Credentials persist in the `cli-data` volume, so subsequent runs skip auth.

**Override command:**

```bash
docker compose run --rm -it cli "happy doctor"
docker compose run --rm -it cli "bash"
```

**Volumes:**

| Volume | Mount | Purpose |
|--------|-------|---------|
| `cli-data` | `/data` | Happy credentials and settings (`/data/.happy/`) |
| `cli-home` | `/root` | User home (`.claude/` settings, shell history) |
| `cli-workspace` | `/workspace` | Working directory for Claude Code sessions |

**Reset CLI state:**

```bash
docker volume rm happy_cli-data happy_cli-home happy_cli-workspace
```

### Data Persistence

Server data (PGlite database, local files) is stored in the `server-data` docker volume mounted at `/data`.

## Prerequisites

- **Node.js** 20+ (Docker uses Node 20; tested with 20 and 24)
- **Yarn** 1.22.x (`corepack enable` to activate)
- Run `yarn install` at the repo root before building or testing

## Tests

### happy-cli

Uses vitest. The `test` script builds first (`tsc --noEmit` + `pkgroll`), then runs tests.

```bash
cd packages/happy-cli
yarn test          # build + run all tests
yarn vitest run    # run tests without rebuilding (faster, uses last build)
```

Requires `yarn install` at the repo root first.
