import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { after, afterEach, before, test } from 'node:test';
import type {
  PartnerConnectorSnapshotT,
  PartnerRemoteProposalT,
  SessionEvent,
} from '@kodax-space/space-ipc-schema';
import type { PartnerConnectorRunService } from './partner-connector-runtime.js';

process.env.KODAX_TEST_ONBOARDING = `connector-sdk-${randomUUID()}`;
process.env.KODAX_SPACE_ENABLE_SDK_EXTENSIONS = '0';
const { applySdkHomeEnv, getKodaxDir } = await import('./data-paths.js');
applySdkHomeEnv();
const directory = getKodaxDir();
const projectRoot = path.join(directory, 'workspace');
const { RealKodaXSession } = await import('./real-session.js');
const { setRendererTarget } = await import('../ipc/push.js');
setRendererTarget(() => null);
const { KodaXBaseProvider, registerModelProvider } = await import('@kodax-ai/kodax/llm');
const sdk = await import('@kodax-ai/kodax/coding');
const binding: PartnerConnectorSnapshotT = {
  extensionId: 'kodax.partner-library',
  connectorId: 'feishu',
  connectionId: randomUUID(),
  connectionRevision: 1,
  name: 'Feishu',
  accountLabel: 'QA',
  documents: [{ url: 'https://example.feishu.cn/docx/Allowed', access: 'append' }],
};
const toolLists: string[][] = [];
const readSessions: string[] = [];
const proposalSessions: string[] = [];
const sessions: InstanceType<typeof RealKodaXSession>[] = [];
let requestRead = false;
let requestPropose = false;
let requested = false;
let beforeRead: (() => void) | undefined;
class RecordingProvider extends KodaXBaseProvider {
  readonly name = 'space-connector-sdk-test';
  readonly supportsThinking = false;
  protected readonly config = {
    apiKeyEnv: 'CONNECTOR_TEST_UNUSED',
    model: 'test',
    supportsThinking: false,
  };
  override isConfigured(): boolean {
    return true;
  }
  async stream(
    ...args: Parameters<InstanceType<typeof KodaXBaseProvider>['stream']>
  ): Promise<Awaited<ReturnType<InstanceType<typeof KodaXBaseProvider>['stream']>>> {
    toolLists.push(args[1].map((tool) => tool.name));
    if (
      (requestRead || requestPropose) &&
      !requested &&
      args[1].some((tool) => tool.name === 'partner_connector_read')
    ) {
      requested = true;
      beforeRead?.();
      return {
        textBlocks: [],
        thinkingBlocks: [],
        toolBlocks: [
          {
            type: 'tool_use',
            id: randomUUID(),
            name: requestPropose ? 'partner_connector_propose' : 'partner_connector_read',
            input: requestPropose
              ? {
                  connectionId: binding.connectionId,
                  operation: 'append',
                  targetUrl: binding.documents[0]!.url,
                  title: 'Reviewed addition',
                  content: 'A proposed paragraph',
                }
              : { connectionId: binding.connectionId, documentUrl: binding.documents[0]!.url },
          },
        ],
        stopReason: 'tool_use',
      };
    }
    return {
      textBlocks: [{ type: 'text', text: 'Done.' }],
      toolBlocks: [],
      thinkingBlocks: [],
      stopReason: 'end_turn',
    };
  }
}
const unregister = registerModelProvider('space-connector-sdk-test', () => new RecordingProvider());
const service: PartnerConnectorRunService = {
  describeBindings: async (bindings) => ({
    connectors: bindings.map((item) => ({ binding: item, available: true })),
  }),
  read: async (context) => {
    readSessions.push(context.sessionId);
    return {
      id: randomUUID(),
      sessionId: context.sessionId,
      projectRoot: context.projectRoot,
      extensionId: binding.extensionId,
      connectorId: binding.connectorId,
      connectionId: binding.connectionId,
      documentId: 'Allowed',
      url: binding.documents[0]!.url,
      title: 'Evidence',
      revision: 1,
      content: 'Evidence from scoped read',
      contentHash: 'a'.repeat(64),
      readAt: new Date().toISOString(),
    };
  },
  propose: async (context, input): Promise<PartnerRemoteProposalT> => {
    proposalSessions.push(context.sessionId);
    return {
      id: randomUUID(),
      sessionId: context.sessionId,
      projectRoot: context.projectRoot,
      extensionId: binding.extensionId,
      connectorId: binding.connectorId,
      connectionRevision: 1,
      ...input,
      contentHash: 'b'.repeat(64),
      scopeHash: 'c'.repeat(64),
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  },
  createBase: async () => {
    throw new Error('No Base task expected');
  },
};
before(async () => {
  await fs.mkdir(projectRoot, { recursive: true });
});
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.dispose()));
  await sdk.awaitLatestCodingMemoryReviewDrain(2000);
  toolLists.length = 0;
  readSessions.length = 0;
  proposalSessions.length = 0;
  requestRead = false;
  requestPropose = false;
  requested = false;
  beforeRead = undefined;
});
after(async () => {
  unregister();
  await fs.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});
function makeSession(bindings?: readonly PartnerConnectorSnapshotT[]) {
  const events: SessionEvent[] = [];
  const session = new RealKodaXSession(
    {
      sessionId: `connectors-${randomUUID()}`,
      projectRoot,
      provider: 'space-connector-sdk-test',
      reasoningMode: 'off',
      permissionMode: 'accept-edits',
      agentMode: 'sa',
      surface: 'partner',
      partnerConnectors: bindings,
      emit: (event) => events.push(event),
      requestPermission: async () => 'allow_once',
    },
    { connectorService: service },
  );
  sessions.push(session);
  return { session, events };
}
async function waitForSession(session: InstanceType<typeof RealKodaXSession>) {
  const deadline = Date.now() + 10000;
  while (session.isRunning()) {
    if (Date.now() > deadline) throw new Error('Connector SDK run timed out');
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

test('actual SDK sees connector tools in Partner A only, not Partner B or ordinary Coder, across multiple turns', async () => {
  const a = makeSession([binding]);
  const b = makeSession();
  await a.session.send('List selected tools.');
  await waitForSession(a.session);
  assert.ok(toolLists.at(-1)?.includes('partner_connector_read'), JSON.stringify(a.events));
  assert.ok(toolLists.at(-1)?.includes('partner_connector_propose'));
  await a.session.send('Continue.');
  await waitForSession(a.session);
  assert.ok(toolLists.at(-1)?.includes('partner_connector_read'));
  await b.session.send('No connectors are selected.');
  await waitForSession(b.session);
  assert.equal(toolLists.at(-1)?.includes('partner_connector_read'), false);
  await sdk.runManagedTask(
    {
      provider: 'space-connector-sdk-test',
      agentMode: 'sa',
      maxIter: 1,
      lsp: false,
      context: {
        gitRoot: projectRoot,
        executionCwd: projectRoot,
        skillsPrompt: '',
        repoIntelligenceMode: 'off',
      },
    },
    'Ordinary Coder baseline.',
  );
  assert.equal(toolLists.at(-1)?.includes('partner_connector_read'), false);
  assert.equal(sdk.getRegisteredToolDefinition('partner_connector_read'), undefined);
});

test('actual SDK dispatches a read through the host gate and a live unbind prevents the next admitted call', async () => {
  const a = makeSession([binding]);
  requestRead = true;
  await a.session.send('Read the scoped document.');
  await waitForSession(a.session);
  assert.deepEqual(readSessions, [a.session.sessionId], JSON.stringify(a.events));
  requested = false;
  beforeRead = () => {
    a.session.partnerConnectors = [];
  };
  await a.session.send('Read again.');
  await waitForSession(a.session);
  assert.deepEqual(readSessions, [a.session.sessionId]);
  assert.ok(
    a.events.some(
      (event) => event.kind === 'tool_result' && /revoked|scope changed/.test(event.content),
    ),
  );
});

test('actual SDK creates only a proposal and plan-mode tightening blocks a previously visible proposal tool', async () => {
  const a = makeSession([binding]);
  requestPropose = true;
  await a.session.send('Propose an addition, do not submit it.');
  await waitForSession(a.session);
  assert.deepEqual(proposalSessions, [a.session.sessionId], JSON.stringify(a.events));
  assert.ok(
    a.events.some((event) => event.kind === 'tool_result' && /pending/.test(event.content)),
  );
  requested = false;
  beforeRead = () => {
    a.session.permissionMode = 'plan';
  };
  await a.session.send('Propose again.');
  await waitForSession(a.session);
  assert.deepEqual(proposalSessions, [a.session.sessionId]);
  requested = false;
  beforeRead = undefined;
  await a.session.send('In plan mode, do not create a proposal.');
  await waitForSession(a.session);
  assert.deepEqual(proposalSessions, [a.session.sessionId]);
  assert.equal(toolLists.at(-1)?.includes('partner_connector_propose'), false);
});
