import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PartnerConnectorStore } from './store.js';

test('connector records migrate from v1 to v2 without losing an existing account', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'partner-connector-store-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'records');
  await fs.mkdir(root, { mode: 0o700 });
  const legacyConnection = {
    id: 'b6c4724a-979d-4267-9968-8ce67653c880',
    extensionId: 'partner.library',
    connectorId: 'feishu-docs',
    revision: 3,
    profile: 'default',
    accountLabel: '测试账号',
    connected: true,
    permissions: { read: true, create: true, append: true, createBase: false },
    appId: 'cli-app',
    openId: 'ou_legacy',
  };
  await fs.writeFile(
    path.join(root, 'records.json'),
    JSON.stringify({
      version: 1,
      connections: [legacyConnection],
      sources: [],
      proposals: [],
      receipts: [],
      baseTasks: [],
      dispatchOwners: {},
    }),
    { mode: 0o600 },
  );

  const firstRead = await new PartnerConnectorStore(root).read();
  assert.equal(firstRead.version, 2);
  assert.deepEqual(firstRead.connections, [legacyConnection]);
  assert.deepEqual(firstRead.documentTasks, []);
  assert.equal(firstRead.recordRevision, 0);

  await new PartnerConnectorStore(root).mutate(() => undefined);
  const reopened = await new PartnerConnectorStore(root).read();
  assert.equal(reopened.version, 2);
  assert.deepEqual(reopened.connections, [legacyConnection]);
  assert.deepEqual(reopened.documentTasks, []);
  assert.equal(reopened.recordRevision, 1);
});
