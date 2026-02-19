import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import path from 'path';

const E2E_DIR = path.resolve(__dirname, '..');

/**
 * E2E Tests for Live Sessions
 *
 * Tests the flow: webapp account creation -> CLI ACP session -> session visible in webapp
 *
 * The CLI uses the same account as the webapp by extracting credentials from
 * localStorage after account creation and passing them to seed-credentials.js.
 *
 * Only runs on one viewport (phone) since the test exercises the CLI->server->webapp
 * integration, not viewport-specific layout. Running on multiple viewports would
 * cause Docker container race conditions.
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

// Helper: seed credentials in the CLI container using webapp's credentials
function seedCliCredentials(token: string, secret: string) {
  console.log('Seeding CLI credentials (shared account)...');
  try {
    const output = run(
      `docker compose --profile manual run --rm --no-deps -T cli "node /app/seed-credentials.js --token ${token} --secret ${secret}"`,
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

// Helper: clear CLI data volume between tests
function clearCliData() {
  try {
    run('docker volume rm -f e2e_cli-data-e2e', { timeout: 10_000 });
  } catch {
    // Ignore if volume doesn't exist
  }
}

// Helper: create account, seed CLI credentials, start ACP session, wait for session to appear
async function setupLiveSession(page: import('@playwright/test').Page) {
  // Create account in webapp
  await page.goto('/');
  await expect(page.getByText('Create account')).toBeVisible({ timeout: 10_000 });

  await Promise.all([
    page.waitForResponse(resp => resp.url().includes('/v1/auth') && resp.status() === 200),
    page.getByText('Create account').click(),
  ]);
  await expect(page.getByText('connected')).toBeVisible({ timeout: 15_000 });

  // Extract credentials from webapp's localStorage
  const credentials = await page.evaluate(() => {
    const raw = localStorage.getItem('auth_credentials');
    if (!raw) throw new Error('No auth_credentials in localStorage');
    return JSON.parse(raw) as { token: string; secret: string };
  });
  console.log(`Extracted webapp credentials, token: ${credentials.token.substring(0, 20)}...`);

  // Seed CLI with the same credentials
  seedCliCredentials(credentials.token, credentials.secret);

  // Start mock ACP session
  startMockAcpSession();

  // Wait for session to appear
  await expect(page.getByText('workspace', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('online').first()).toBeVisible();
}

test.describe('Live Sessions', () => {
  test.afterEach(async () => {
    stopCliContainers();
    clearCliData();
  });

  test('start ACP session and see it in webapp', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-phone', 'runs only on phone viewport');

    await setupLiveSession(page);
  });

  test('cancel thinking agent should not disconnect session', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-phone', 'runs only on phone viewport');

    await setupLiveSession(page);

    // Navigate to session detail by clicking the session row
    await page.getByText('workspace', { exact: true }).first().click();

    // Wait for session detail view to load (input placeholder visible)
    const messageInput = page.getByPlaceholder('Type a message ...');
    await expect(messageInput).toBeVisible({ timeout: 10_000 });

    // Send message containing "slow" — mock agent will sleep for 60s (cancelable)
    await messageInput.click();
    await page.keyboard.type('Do something slow');
    await page.keyboard.press('Enter');

    // Wait for the user message to appear in the chat, confirming it was sent
    await expect(page.getByText('Do something slow')).toBeVisible({ timeout: 10_000 });

    // Give time for the CLI to receive the message and start processing
    await page.waitForTimeout(5_000);

    // Press the cancel/abort button
    await page.getByTestId('abort-button').click();

    // Wait briefly for the cancel to take effect
    await page.waitForTimeout(3_000);

    // After cancel, session should still be connected — not disconnected
    // The session detail status should show "online", not "last seen"
    await expect(page.getByText(/last seen/)).not.toBeVisible();

    // Navigate back to session list and verify session is still there
    await page.goBack();
    await expect(page.getByText('workspace', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('online').first()).toBeVisible({ timeout: 10_000 });
  });
});
