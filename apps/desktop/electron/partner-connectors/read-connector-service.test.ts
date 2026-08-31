import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PartnerConnectorService, type PartnerConnectorContext } from './service.js';
import { FeishuCli } from './feishu-cli.js';
import type { ReadConnector, ReadConnectorIdentity } from './read-connector.js';
import { createWecomConnector } from './wecom-cli.js';

async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'partner-read-connectors-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let identity: ReadConnectorIdentity = {
    authorityId: 'corp1',
    subjectId: 'user1',
    label: 'Account',
  };
  let reads = 0;
  const adapter: ReadConnector = {
    id: 'wecom-cli',
    inspect: async () => ({ installed: true, version: '1.2.0', identity }),
    run: async () => undefined,
    isAuthorizationUrl: (value): value is string =>
      typeof value === 'string' && value.startsWith('https://work.weixin.qq.com/'),
    acceptsResource: (value) => /^wecom:\/\/document\/[A-Za-z0-9]+$/.test(value),
    read: async (input) => {
      await input.beforeRead();
      input.assertRead();
      reads++;
      return {
        documentId: 'Doc1',
        url: input.documentUrl,
        title: 'Document',
        revision: 0,
        content: 'Safe text',
      };
    },
  };
  const service = new PartnerConnectorService(root, {
    cli: new FeishuCli(async () => {
      throw new Error('Must not dispatch through Feishu');
    }),
    readConnectors: { 'wecom-cli': adapter },
    catalog: async () => [{ id: 'wecom', adapter: 'wecom-cli', name: '企业微信', description: '' }],
    checkPolicy: async () => undefined,
  });
  const owner = { extensionId: 'partner.library', connectorId: 'wecom', profile: 'space-test' };
  const connection = await service.connect(owner);
  const selection = {
    extensionId: owner.extensionId,
    connectorId: owner.connectorId,
    connectionId: connection.id,
    connectionRevision: connection.revision,
    adapter: 'wecom-cli' as const,
    documents: [{ url: 'wecom://document/Doc1', access: 'read' as const }],
  };
  const bindings = await service.resolveSelections([selection]);
  const context: PartnerConnectorContext = {
    sessionId: 'session1',
    projectRoot: '/project',
    surface: 'partner',
    permissionMode: 'accept-edits',
    bindings,
  };
  return {
    service,
    connection,
    selection,
    context,
    adapter,
    reads: () => reads,
    switchIdentity: () => {
      identity = { ...identity, subjectId: 'user2' };
    },
  };
}

test('a second provider connects independently, pins read scope and stores real read results', async (t) => {
  const f = await fixture(t);
  assert.equal(f.connection.adapter, 'wecom-cli');
  assert.deepEqual(f.connection.permissions, { read: true, create: false, append: false });
  assert.equal('providerIdentity' in f.connection, false);
  assert.equal('subjectId' in f.connection, false);
  const source = await f.service.read(f.context, {
    connectionId: f.connection.id,
    documentUrl: 'wecom://document/Doc1',
  });
  assert.equal(source.content, 'Safe text');
  assert.equal(f.reads(), 1);
  assert.equal((await f.service.records(f.context)).sources.length, 1);
  await assert.rejects(
    f.service.read(f.context, {
      connectionId: f.connection.id,
      documentUrl: 'wecom://document/Other',
    }),
  );
  await assert.rejects(
    f.service.resolveSelections([
      {
        ...f.selection,
        adapter: 'dingtalk-cli',
        documents: [{ url: 'dingtalk://document/Doc1', access: 'read' }],
      },
    ]),
  );
  await assert.rejects(
    f.service.read(
      { ...f.context, surface: 'code' },
      { connectionId: f.connection.id, documentUrl: 'wecom://document/Doc1' },
    ),
  );
  f.switchIdentity();
  await assert.rejects(f.service.resolveSelections([f.selection]));
});

test('read-only host rejects skipped guards, cross-provider writes and revoked reads without persisting results', async (t) => {
  const f = await fixture(t);
  const read = f.adapter.read;
  await assert.rejects(
    f.service.resolveSelections([
      { ...f.selection, documents: [{ url: 'wecom://document/Unsupported_1', access: 'read' }] },
    ]),
    /资源引用/,
  );
  f.adapter.read = async (input) => ({
    documentId: 'Doc1',
    url: input.documentUrl,
    title: 'bad',
    revision: 0,
    content: 'unguarded',
  });
  await assert.rejects(
    f.service.read(f.context, {
      connectionId: f.connection.id,
      documentUrl: 'wecom://document/Doc1',
    }),
    /读取未通过/,
  );
  assert.equal((await f.service.records(f.context)).sources.length, 0);
  f.adapter.read = read;
  await assert.rejects(
    f.service.resolveSelections([
      { ...f.selection, documents: [{ url: 'wecom://document/Doc1', access: 'append' }] },
    ]),
  );
  await assert.rejects(
    f.service.propose(f.context, {
      connectionId: f.connection.id,
      operation: 'append',
      targetUrl: 'https://example.feishu.cn/docx/Doc1',
      title: 'wrong provider',
      content: 'must not write',
      rationale: '',
    }),
  );
  const bindings = [...f.context.bindings];
  f.context.getCurrentBindings = () => bindings;
  f.adapter.read = async (input) => {
    await input.beforeRead();
    bindings.length = 0;
    input.assertRead();
    throw new Error('must not reach business dispatch');
  };
  await assert.rejects(
    f.service.read(f.context, {
      connectionId: f.connection.id,
      documentUrl: 'wecom://document/Doc1',
    }),
  );
  assert.equal(f.reads(), 0);
  assert.equal((await f.service.records(f.context)).sources.length, 0);
});

test('real WeCom adapter composes with host guards and retains both approved reference forms', async (t) => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'partner-wecom-compose-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  let businessReads = 0;
  const adapter = createWecomConnector({
    root,
    platform: 'darwin',
    arch: 'arm64',
    verifyBinary: async (file) => file === process.execPath,
    installer: { executable: process.execPath, install: async () => process.execPath },
    processFactory: () => async (input) => {
      await input.beforeSpawn?.();
      input.assertSpawn?.();
      let stdout = '';
      if (input.args[0] === '--version')
        stdout = 'wecom-cli 1.2.0 (unknown 2026-08-25T10:23:42Z 78c514b)\n';
      else if (input.args[0] === 'auth') stdout = 'Status: authorized\nBot ID: aib-test-bot\n';
      else if (input.args[0] === 'identity') stdout = '{"opaqueIdentity":{"serverOwned":true}}';
      else {
        businessReads++;
        stdout = JSON.stringify({
          url: 'https://doc.weixin.qq.com/doc/Doc1',
          name: 'Document',
          content: 'Fixture body',
          version: 1,
        });
      }
      return { exitCode: 0, stdout, stderr: '' };
    },
  });
  const service = new PartnerConnectorService(root, {
    cli: new FeishuCli(async () => {
      throw new Error('No Feishu calls');
    }),
    readConnectors: { 'wecom-cli': adapter },
    catalog: async () => [{ id: 'wecom', adapter: 'wecom-cli', name: '企业微信', description: '' }],
    checkPolicy: async () => undefined,
  });
  const owner = {
    extensionId: 'partner.library',
    connectorId: 'wecom',
    profile: 'space-11111111-1111-4111-8111-111111111111',
  };
  const connection = await service.connect(owner);
  for (const url of ['wecom://document/Doc1', 'https://doc.weixin.qq.com/doc/Doc1']) {
    const bindings = await service.resolveSelections([
      {
        extensionId: owner.extensionId,
        connectorId: owner.connectorId,
        connectionId: connection.id,
        connectionRevision: connection.revision,
        adapter: 'wecom-cli',
        documents: [{ url, access: 'read' }],
      },
    ]);
    const context: PartnerConnectorContext = {
      sessionId: 'session',
      projectRoot: '/project',
      surface: 'partner',
      permissionMode: 'accept-edits',
      bindings,
    };
    const result = await service.read(context, { connectionId: connection.id, documentUrl: url });
    assert.equal(result.url, url);
    assert.equal(result.content, 'Fixture body');
  }
  assert.equal(businessReads, 2);
});
