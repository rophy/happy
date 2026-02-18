#!/usr/bin/env node

/**
 * Seed Happy CLI credentials for E2E testing
 *
 * Two modes:
 *   1. Create new account: node seed-credentials.js
 *   2. Use existing credentials: node seed-credentials.js --token <token> --secret <base64url-secret>
 *
 * In mode 2, the secret should be base64url-encoded (as stored by the webapp).
 * It will be converted to standard base64 for the CLI's access.key format.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');

// tweetnacl is available in the workspace node_modules
const nacl = require('/repo/node_modules/tweetnacl');

const SERVER_URL = process.env.HAPPY_SERVER_URL || 'http://server:3005';
const HAPPY_HOME_DIR = process.env.HAPPY_HOME_DIR || '/data/.happy';

function log(msg) {
  process.stderr.write(`[seed-credentials] ${msg}\n`);
}

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);

    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          reject(new Error(`Invalid JSON response: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function waitForServer(maxRetries = 30, intervalMs = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await postJson(`${SERVER_URL}/v1/auth`, {
        challenge: Buffer.from(crypto.randomBytes(32)).toString('base64'),
        publicKey: Buffer.from(crypto.randomBytes(32)).toString('base64'),
        signature: Buffer.from(crypto.randomBytes(64)).toString('base64'),
      });
      // Even if auth fails, server is responding
      return true;
    } catch (err) {
      log(`Waiting for server... (${i + 1}/${maxRetries})`);
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }
  throw new Error(`Server at ${SERVER_URL} not available after ${maxRetries} retries`);
}

async function createAccount() {
  // Generate a 32-byte secret (same as webapp's getRandomBytesAsync(32))
  const secret = crypto.randomBytes(32);

  // Derive Ed25519 keypair from secret (same as authChallenge in encryption.ts)
  const keypair = nacl.sign.keyPair.fromSeed(secret);

  // Generate random challenge
  const challenge = crypto.randomBytes(32);

  // Sign the challenge
  const signature = nacl.sign.detached(challenge, keypair.secretKey);

  // POST /v1/auth to create account
  const res = await postJson(`${SERVER_URL}/v1/auth`, {
    challenge: Buffer.from(challenge).toString('base64'),
    publicKey: Buffer.from(keypair.publicKey).toString('base64'),
    signature: Buffer.from(signature).toString('base64'),
  });

  if (res.status !== 200 || !res.data.token) {
    throw new Error(`Auth failed: ${JSON.stringify(res.data)}`);
  }

  return { secret, token: res.data.token };
}

function writeCredentials(token, secret) {
  fs.mkdirSync(HAPPY_HOME_DIR, { recursive: true });

  // Write access.key in legacy format (matches readCredentials in persistence.ts)
  const credentialsPath = path.join(HAPPY_HOME_DIR, 'access.key');
  fs.writeFileSync(credentialsPath, JSON.stringify({
    secret: Buffer.from(secret).toString('base64'),
    token: token,
  }, null, 2));
  log(`Written ${credentialsPath}`);

  // Write settings.json with machine ID
  const settingsPath = path.join(HAPPY_HOME_DIR, 'settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify({
    schemaVersion: 2,
    onboardingCompleted: true,
    machineId: crypto.randomUUID(),
    machineIdConfirmedByServer: false,
    daemonAutoStartWhenRunningHappy: false,
    profiles: [],
    localEnvironmentVariables: {},
  }, null, 2));
  log(`Written ${settingsPath}`);

  // Ensure logs dir exists
  fs.mkdirSync(path.join(HAPPY_HOME_DIR, 'logs'), { recursive: true });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--token' && args[i + 1]) {
      parsed.token = args[++i];
    } else if (args[i] === '--secret' && args[i + 1]) {
      parsed.secret = args[++i];
    }
  }
  return parsed;
}

// Convert base64url to standard base64
function base64urlToBase64(base64url) {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad === 2) base64 += '==';
  else if (pad === 3) base64 += '=';
  return base64;
}

async function main() {
  log(`Server URL: ${SERVER_URL}`);
  log(`Happy home: ${HAPPY_HOME_DIR}`);

  const args = parseArgs();

  let token, secret;

  if (args.token && args.secret) {
    // Mode 2: Use existing credentials from webapp
    log('Using provided credentials (shared account mode)');
    token = args.token;
    // Webapp stores secret as base64url, CLI expects standard base64
    const secretBase64 = base64urlToBase64(args.secret);
    secret = Buffer.from(secretBase64, 'base64');
    log(`Token: ${token.substring(0, 20)}...`);
  } else {
    // Mode 1: Create new account
    await waitForServer();
    log('Server is available');
    const result = await createAccount();
    token = result.token;
    secret = result.secret;
    log(`Account created, token: ${token.substring(0, 20)}...`);
  }

  writeCredentials(token, secret);
  log('Credentials seeded successfully');
}

main().catch((err) => {
  log(`ERROR: ${err.message}`);
  process.exit(1);
});
