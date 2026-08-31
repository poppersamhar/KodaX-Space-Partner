import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type {
  PartnerConnectorSnapshotT,
  PartnerRemoteProposalT,
  PartnerRemoteSourceT,
} from '@kodax-space/space-ipc-schema';
import {
  createPartnerConnectorRunRuntime,
  PARTNER_CONNECTOR_READ,
  PARTNER_CONNECTOR_PROPOSE,
} from './partner-connector-runtime.js';
import type { ExtensionRuntimeContract } from '@kodax-ai/kodax/coding';

const connectionId = randomUUID();
const binding: PartnerConnectorSnapshotT = {
  extensionId: 'kodax.partner-library',
  connectorId: 'feishu',
  connectionId,
  connectionRevision: 1,
  name: 'Feishu',
  accountLabel: 'QA',
  documents: [{ url: 'https://example.feishu.cn/docx/Allowed', access: 'append' }],
};
const source: PartnerRemoteSourceT = {
  id: randomUUID(),
  sessionId: 'session-one',
  projectRoot: '/project',
  extensionId: binding.extensionId,
  connectorId: binding.connectorId,
  connectionId,
  documentId: 'Allowed',
  url: binding.documents[0]!.url,
  title: 'Document',
  revision: 1,
  content: 'Actual remote evidence',
  contentHash: 'a'.repeat(64),
  readAt: new Date().toISOString(),
};
const context = {
  sessionId: 'session-one',
  projectRoot: '/project',
  surface: 'partner' as const,
  permissionMode: 'accept-edits' as const,
  bindings: [binding],
};
const service = {
  describeBindings: async (items: readonly PartnerConnectorSnapshotT[]) => ({
    connectors: items.map((item) => ({ binding: item, available: true })),
  }),
  read: async () => source,
  propose: async (): Promise<PartnerRemoteProposalT> => {
    throw new Error('No writes expected');
  },
};

test('read-only connector runs never advertise proposals and accept only their scoped resource', async () => {
  const selected: PartnerConnectorSnapshotT = {
    ...binding,
    adapter: 'tencent-meeting-cli',
    connectorId: 'tencent-meeting',
    name: '腾讯会议',
    documents: [{ url: 'tmeet://meeting/12345', access: 'read' }],
  };
  const runtime = await createPartnerConnectorRunRuntime(
    undefined,
    { ...context, bindings: [selected] },
    service,
  );
  assert.ok(runtime);
  assert.deepEqual(
    runtime.listRunTools!('mcp').map((tool) => tool.name),
    [PARTNER_CONNECTOR_READ],
  );
  assert.doesNotMatch(runtime.listRunTools!('mcp')[0].description, /Feishu document/);
  await runtime.executeCapability('mcp', 'partner-connectors/read', {
    connectionId,
    documentUrl: 'tmeet://meeting/12345',
  });
  await assert.rejects(
    runtime.executeCapability('mcp', 'partner-connectors/read', {
      connectionId,
      documentUrl: 'tmeet://meeting/999',
    }),
  );
  await assert.rejects(runtime.executeCapability('mcp', 'partner-connectors/propose', {}));
});

test('connector tools are run-scoped, Partner-only, available-only and never registered globally', async () => {
  const sdk = await import('@kodax-ai/kodax/coding');
  const before = sdk.getAllRegisteredTools().map((tool) => tool.name);
  const runtime = await createPartnerConnectorRunRuntime(undefined, context, service);
  assert.deepEqual(
    sdk.listRunScopedTools(runtime).map((tool) => tool.name),
    [PARTNER_CONNECTOR_READ, PARTNER_CONNECTOR_PROPOSE],
  );
  assert.equal(
    await createPartnerConnectorRunRuntime(undefined, { ...context, surface: 'code' }, service),
    undefined,
  );
  assert.equal(
    await createPartnerConnectorRunRuntime(undefined, { ...context, bindings: [] }, service),
    undefined,
  );
  const disabled = await createPartnerConnectorRunRuntime(undefined, context, {
    ...service,
    describeBindings: async () => ({
      connectors: [{ binding, available: false, unavailableReason: 'Disabled' }],
    }),
  });
  assert.deepEqual(sdk.listRunScopedTools(disabled), []);
  assert.deepEqual(
    sdk.getAllRegisteredTools().map((tool) => tool.name),
    before,
  );
});

test('read is grounded in the run scope and live revocation stops even an already admitted tool', async () => {
  let bindings: readonly PartnerConnectorSnapshotT[] = [binding];
  let calls = 0;
  const runtime = await createPartnerConnectorRunRuntime(
    undefined,
    { ...context, getCurrentBindings: () => bindings },
    {
      ...service,
      read: async () => {
        calls++;
        return source;
      },
    },
  );
  assert.ok(runtime);
  const read = runtime.listRunTools!('mcp')[0]!;
  const result = await runtime.executeCapability('mcp', read.capabilityId, {
    connectionId,
    documentUrl: source.url,
  });
  assert.match(result.content!, /Actual remote evidence/);
  bindings = [];
  await assert.rejects(
    () =>
      runtime.executeCapability('mcp', read.capabilityId, {
        connectionId,
        documentUrl: source.url,
      }),
    /scope|selected|revoked/,
  );
  assert.equal(calls, 1);
});

test('plan hides and rejects proposal tool; no connector operation exposes raw remote write', async () => {
  const runtime = await createPartnerConnectorRunRuntime(
    undefined,
    { ...context, permissionMode: 'plan' },
    service,
  );
  assert.ok(runtime);
  assert.deepEqual(
    runtime.listRunTools!('mcp').map((tool) => tool.name),
    [PARTNER_CONNECTOR_READ],
  );
  await assert.rejects(
    () => runtime.executeCapability('mcp', 'partner-connectors/propose', {}),
    /not active|not available/,
  );
  await assert.rejects(
    () => runtime.executeCapability('mcp', 'partner-connectors/apply', {}),
    /not active|not available/,
  );
});

test('failed read is not promoted to evidence and revocation while reading suppresses its result', async () => {
  let bindings: readonly PartnerConnectorSnapshotT[] = [binding];
  const runtime = await createPartnerConnectorRunRuntime(
    undefined,
    { ...context, getCurrentBindings: () => bindings },
    {
      ...service,
      read: async () => {
        bindings = [];
        return source;
      },
    },
  );
  assert.ok(runtime);
  await assert.rejects(
    () =>
      runtime.executeCapability('mcp', 'partner-connectors/read', {
        connectionId,
        documentUrl: source.url,
      }),
    /scope|selected|revoked/,
  );
});

test('a proposal creates only a review record and a live switch to plan blocks later proposals', async () => {
  let mode: 'accept-edits' | 'plan' = 'accept-edits';
  let calls = 0;
  const proposal: PartnerRemoteProposalT = {
    id: randomUUID(),
    sessionId: context.sessionId,
    projectRoot: context.projectRoot,
    extensionId: binding.extensionId,
    connectorId: binding.connectorId,
    connectionId,
    connectionRevision: 1,
    operation: 'append',
    targetUrl: source.url,
    title: 'Append review',
    content: 'A proposed paragraph',
    rationale: 'Requested addition',
    contentHash: 'b'.repeat(64),
    scopeHash: 'c'.repeat(64),
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const runtime = await createPartnerConnectorRunRuntime(
    undefined,
    { ...context, getCurrentPermissionMode: () => mode },
    {
      ...service,
      propose: async () => {
        calls++;
        return proposal;
      },
    },
  );
  assert.ok(runtime);
  const input = {
    connectionId,
    operation: 'append',
    targetUrl: source.url,
    title: proposal.title,
    content: proposal.content,
  };
  const result = await runtime.executeCapability('mcp', 'partner-connectors/propose', input);
  assert.equal(JSON.parse(result.content!).status, 'pending');
  mode = 'plan';
  await assert.rejects(
    () => runtime.executeCapability('mcp', 'partner-connectors/propose', input),
    /plan/,
  );
  assert.equal(calls, 1);
});

test('the run adapter preserves existing MCP capability and lifecycle methods without taking ownership', async () => {
  const calls: string[] = [];
  const base: ExtensionRuntimeContract = {
    getDefaults: () => ({ modelSelection: { provider: 'unchanged' } }),
    hydrateSession: async (id) => {
      calls.push(id);
    },
    hasCapabilityProvider: (provider) => provider === 'existing',
    searchCapabilities: async () => ['existing-search'],
    searchCapabilitySnapshot: async () => ({
      items: ['snapshot'],
      complete: true,
      freshness: 'cached',
    }),
    describeCapability: async () => ({ description: 'existing tool' }),
    executeCapability: async () => ({ kind: 'tool', content: 'existing execute' }),
    readCapability: async () => ({ kind: 'resource', content: 'existing read' }),
    getCapabilityPrompt: async () => 'existing prompt',
    getCapabilityPromptContext: async () => 'existing context',
    listRunTools: () => [
      {
        name: 'existing_tool',
        description: '',
        capabilityId: 'existing/id',
        sideEffect: 'readonly',
        planModeAllowed: true,
        inputSchema: { type: 'object' },
      },
    ],
  };
  assert.equal(
    await createPartnerConnectorRunRuntime(base, { ...context, surface: 'code' }, service),
    base,
  );
  const runtime = await createPartnerConnectorRunRuntime(base, context, service);
  assert.ok(runtime);
  assert.deepEqual(runtime.getDefaults?.(), { modelSelection: { provider: 'unchanged' } });
  await runtime.hydrateSession?.('same-session');
  assert.deepEqual(calls, ['same-session']);
  assert.equal(runtime.hasCapabilityProvider?.('existing'), true);
  assert.equal(runtime.hasCapabilityProvider?.('other'), false);
  assert.deepEqual(await runtime.searchCapabilities('mcp', 'query'), ['existing-search']);
  assert.deepEqual(await runtime.searchCapabilitySnapshot?.('mcp', 'query'), {
    items: ['snapshot'],
    complete: true,
    freshness: 'cached',
  });
  assert.deepEqual(await runtime.describeCapability('mcp', 'id'), { description: 'existing tool' });
  assert.equal((await runtime.executeCapability('existing', 'id', {})).content, 'existing execute');
  assert.equal((await runtime.readCapability('mcp', 'id')).content, 'existing read');
  assert.equal(await runtime.getCapabilityPrompt('mcp', 'id'), 'existing prompt');
  assert.equal(await runtime.getCapabilityPromptContext('mcp'), 'existing context');
  assert.deepEqual(
    runtime.listRunTools?.('other').map((tool) => tool.name),
    ['existing_tool'],
  );
  assert.deepEqual(
    runtime.listRunTools?.('mcp').map((tool) => tool.name),
    ['existing_tool', PARTNER_CONNECTOR_READ, PARTNER_CONNECTOR_PROPOSE],
  );
});

test('reserved connector names cannot be shadowed by an unrelated base capability', async () => {
  const base = await createPartnerConnectorRunRuntime(undefined, context, service);
  assert.ok(base);
  base.listRunTools = () => [
    {
      name: PARTNER_CONNECTOR_READ,
      capabilityId: 'foreign/read',
      description: 'Not the host connector',
      sideEffect: 'reads-network',
      planModeAllowed: true,
      inputSchema: { type: 'object' },
    },
  ];
  const runtime = await createPartnerConnectorRunRuntime(base, context, service);
  assert.deepEqual(
    runtime
      ?.listRunTools?.('mcp')
      .filter((tool) => tool.name === PARTNER_CONNECTOR_READ)
      .map((tool) => tool.capabilityId),
    ['partner-connectors/read'],
  );
});
