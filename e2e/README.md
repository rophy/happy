# Happy E2E Tests

End-to-end tests using Playwright against Docker Compose services.

## Setup

```bash
cd e2e
npm install
npx playwright install chromium
```

## Run Tests

```bash
# Start services (if not already running) and run all tests
npx playwright test

# Specific test suites
npm run test:smoke
npm run test:auth
npm run test:live-sessions

# Interactive / debug modes
npm run test:ui
npm run test:headed
```

Services: server on `localhost:3005`, webapp on `localhost:8080`.
If services are already running, tests reuse them (`reuseExistingServer: true`).

## Architecture

### Docker Compose Services

| Service | Port | Purpose |
|---------|------|---------|
| server | 3005 | Happy API server |
| webapp | 8080 | Happy webapp |
| postgres | (internal) | Database |
| cli | (manual profile) | CLI container for live session tests |

The `cli` service uses `profiles: [manual]` so it doesn't start with `docker compose up`.
Playwright controls it via `docker compose --profile manual run`.

### Live Session Testing

The live session test validates the full stack: CLI -> ACP agent -> server -> webapp.

**How it works:**

1. Playwright creates a webapp account (same as auth test)
2. `seed-credentials.js` creates a separate CLI account on the server using the same Ed25519 challenge/signature flow as the webapp
3. `happy acp -- node /app/mock-acp-agent.js` starts a mock ACP session
4. The mock agent uses the official `@agentclientprotocol/sdk` to speak the ACP protocol
5. Test verifies the webapp remains functional with the session running

**Mock ACP Agent** (`mock-acp-agent.js`):
- Uses `AgentSideConnection` + `ndJsonStream` from the ACP SDK
- Handles `initialize`, `newSession`, `authenticate`, `prompt`
- Simulates tool calls and text responses with realistic delays
- No real AI provider needed — deterministic responses

**Credential Seeding** (`seed-credentials.js`):
- Runs at test time (not build time) against the live server
- Creates account via `POST /v1/auth` with Ed25519 challenge/signature (uses tweetnacl)
- Writes `access.key` + `settings.json` to `HAPPY_HOME_DIR`

## Viewports

Tests run on both:
- **Phone**: 375x667 (empty state: "Ready to code?")
- **Tablet**: 768x1024 (empty state: "No active sessions")

## Clean Up

```bash
# Stop services
docker compose down

# Remove CLI data volumes
docker volume rm e2e_cli-data-e2e e2e_cli-workspace-e2e

# Full clean
npm run clean
```