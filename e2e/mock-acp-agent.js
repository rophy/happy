#!/usr/bin/env node

/**
 * Mock ACP Agent for E2E Testing
 *
 * Uses the official @agentclientprotocol/sdk (same version bundled with happy-cli)
 * to implement a minimal ACP agent that provides deterministic responses.
 *
 * This agent is spawned by `happy acp -- node /app/mock-acp-agent.js`
 * and communicates via ndJSON over stdin/stdout.
 */

const { Readable, Writable } = require('node:stream');

// ACP SDK is installed in happy-cli's local node_modules
const ACP_SDK_PATH = '/repo/packages/happy-cli/node_modules/@agentclientprotocol/sdk';
const { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } = require(ACP_SDK_PATH);

class MockAgent {
  constructor(connection) {
    this.connection = connection;
    this.sessions = new Map();
  }

  async initialize(_params) {
    return {
      protocolVersion: PROTOCOL_VERSION,
      agentCapabilities: {
        loadSession: false,
      },
    };
  }

  async newSession(_params) {
    const sessionId = Array.from(require('crypto').randomBytes(16))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    this.sessions.set(sessionId, { pendingPrompt: null });
    return { sessionId };
  }

  async authenticate(_params) {
    return {};
  }

  async setSessionMode(_params) {
    return {};
  }

  async prompt(params) {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw new Error(`Session ${params.sessionId} not found`);
    }

    session.pendingPrompt?.abort();
    session.pendingPrompt = new AbortController();

    try {
      await this.simulateTurn(params.sessionId, session.pendingPrompt.signal);
    } catch (err) {
      if (session.pendingPrompt?.signal.aborted) {
        return { stopReason: 'cancelled' };
      }
      throw err;
    }

    session.pendingPrompt = null;
    return { stopReason: 'end_turn' };
  }

  async simulateTurn(sessionId, signal) {
    // Send initial text
    await this.connection.sessionUpdate({
      sessionId,
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'Hello from mock ACP agent! Let me read a file for you.' },
      },
    });

    await this.sleep(500, signal);

    // Simulate a read tool call
    await this.connection.sessionUpdate({
      sessionId,
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'call_1',
        title: 'Reading README.md',
        kind: 'read',
        status: 'pending',
        locations: [{ path: '/workspace/README.md' }],
        rawInput: { path: '/workspace/README.md' },
      },
    });

    await this.sleep(300, signal);

    // Complete tool call
    await this.connection.sessionUpdate({
      sessionId,
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'call_1',
        status: 'completed',
        content: [{
          type: 'content',
          content: { type: 'text', text: '# Mock Project\n\nThis is the e2e test workspace.' },
        }],
        rawOutput: { content: '# Mock Project\n\nThis is the e2e test workspace.' },
      },
    });

    await this.sleep(300, signal);

    // Send final text
    await this.connection.sessionUpdate({
      sessionId,
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: {
          type: 'text',
          text: ' I found the README. The project looks good! This mock session is working correctly.',
        },
      },
    });
  }

  async cancel(params) {
    const session = this.sessions.get(params.sessionId);
    session?.pendingPrompt?.abort();
  }

  sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('aborted'));
        }, { once: true });
      }
    });
  }
}

// Wire up stdin/stdout for ACP communication
const input = Writable.toWeb(process.stdout);
const output = Readable.toWeb(process.stdin);
const stream = ndJsonStream(input, output);

new AgentSideConnection((conn) => new MockAgent(conn), stream);

process.stderr.write('[mock-acp-agent] Started\n');
