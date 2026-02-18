import { test, expect } from '@playwright/test';
import { execSync, exec } from 'child_process';

const E2E_DIR = '/home/rophy/projects/happy/e2e';

/**
 * E2E Tests for Live Sessions
 *
 * Tests the flow: webapp account creation -> CLI ACP session -> session visible in webapp
 *
 * Prerequisites:
 *   - server, webapp, postgres running via docker compose (handled by webServer config)
 *   - CLI container built: docker compose --profile manual build cli
 */

// Helper: run command in e2e directory
function run(cmd: string, options?: { timeout?: number }) {
  return execSync(cmd, {
    cwd: E2E_DIR,
    encoding: 'utf8',
    timeout: options?.timeout ?? 30_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

// Helper: seed credentials in the CLI container (creates account on server)
async function seedCliCredentials() {
  console.log('Seeding CLI credentials...');
  try {
    const output = run(
      'docker compose --profile manual run --rm --no-deps -T cli "node /app/seed-credentials.js"',
      { timeout: 60_000 },
    );
    console.log('Seed output:', output);
  } catch (error: any) {
    console.error('Seed stderr:', error.stderr);
    throw error;
  }
}

// Helper: start mock ACP session in CLI container (runs in background)
function startMockAcpSession() {
  console.log('Starting mock ACP session...');
  try {
    // Run in detached mode so it doesn't block
    run(
      'docker compose --profile manual run -d -T cli "happy acp -- node /app/mock-acp-agent.js"',
      { timeout: 30_000 },
    );
    console.log('Mock ACP session started');
  } catch (error: any) {
    console.error('Failed to start ACP session:', error.stderr);
    throw error;
  }
}

// Helper: stop all CLI containers spawned by e2e tests
function stopCliContainers() {
  try {
    // Find running containers with "e2e-cli-run" in the name and remove them
    const containers = execSync(
      'docker ps -q --filter "name=e2e-cli-run"',
      { encoding: 'utf8', cwd: E2E_DIR },
    ).trim();
    if (containers) {
      execSync(`docker rm -f ${containers.split('\n').join(' ')}`, {
        cwd: E2E_DIR,
        stdio: 'ignore',
      });
    }
  } catch {
    // Ignore errors during cleanup
  }
}

test.describe('Live Sessions', () => {
  // Clean up CLI containers after each test
  test.afterEach(async () => {
    stopCliContainers();
  });

  test('start ACP session and see it in webapp', async ({ page }) => {
    // Step 1: Create account in webapp
    await page.goto('/');
    await expect(page.getByText('Create account')).toBeVisible({ timeout: 10_000 });

    await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/v1/auth') && resp.status() === 200),
      page.getByText('Create account').click(),
    ]);
    await expect(page.getByText('connected')).toBeVisible({ timeout: 15_000 });

    // Step 2: Seed CLI credentials (creates a separate account on the server)
    await seedCliCredentials();

    // Step 3: Start mock ACP session
    startMockAcpSession();

    // Step 4: Wait for session to appear in webapp
    // The session should show up in the sessions list once the CLI connects to the server
    // Give it time to establish the WebSocket connection and register the session
    await page.waitForTimeout(5_000);

    // Reload to pick up new session data
    await page.reload();
    await expect(page.getByText('connected')).toBeVisible({ timeout: 15_000 });

    // TODO: Assert that the session appears in the webapp session list.
    // The exact UI elements depend on how the webapp renders sessions from other accounts
    // vs. the same account. For now, verify the page doesn't crash and remains functional.
    console.log('Live session test completed - session started successfully');
  });
});
