import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PartnerConnectorService, type PartnerConnectorContext } from './service.js';
import type { FeishuCli, FeishuCreateInput } from './feishu-cli.js';

const doc = 'https://test.feishu.cn/docx/doc123';
const folder = 'https://test.feishu.cn/drive/folder/folder123';
async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'partner-connectors-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let enabled = true;
  let writes = 0;
  let revision = 1;
  const cli: Pick<FeishuCli, 'inspect' | 'listProfiles' | 'read' | 'create' | 'append'> = {
    inspect: async (profile) => ({
      installed: true,
      version: '1.0.92',
      identity: {
        profile,
        appId: 'cli_test',
        openId: 'ou_test',
        label: 'Test user',
        scopes: ['docx:document:readonly', 'docx:document:create', 'docx:document:write_only'],
      },
    }),
    listProfiles: async () => [{ name: 'test', label: 'Test' }],
    read: async () => ({
      documentId: 'doc123',
      url: doc,
      title: 'Test',
      revision,
      content: `text${revision}`,
    }),
    create: async (input: FeishuCreateInput) => {
      await input.beforeDispatch?.();
      input.assertDispatch?.();
      writes++;
      return {
        status: 'success',
        documentId: 'new123',
        url: 'https://test.feishu.cn/docx/new123',
        revision: 1,
      };
    },
    append: async (input) => {
      await input.beforeDispatch?.();
      input.assertDispatch?.();
      writes++;
      return { status: 'success', documentId: 'doc123', url: doc, revision: 2 };
    },
  };
  const service = new PartnerConnectorService(root, {
    cli,
    catalog: async () => {
      if (!enabled) throw new Error('disabled');
      return [{ id: 'feishu', adapter: 'feishu-cli', name: '飞书文档', description: '' }];
    },
    checkPolicy: async () => undefined,
  });
  const connection = await service.connect({
    extensionId: 'partner.library',
    connectorId: 'feishu',
    profile: 'test',
  });
  const bindings = await service.resolveSelections([
    {
      extensionId: 'partner.library',
      connectorId: 'feishu',
      connectionId: connection.id,
      connectionRevision: connection.revision,
      documents: [{ url: doc, access: 'append' }],
      createFolderUrl: folder,
    },
  ]);
  const context: PartnerConnectorContext = {
    sessionId: 'session-a',
    projectRoot: '/test/project',
    surface: 'partner',
    permissionMode: 'accept-edits',
    bindings,
    getCurrentBindings: () => bindings,
  };
  return {
    root,
    service,
    context,
    connection,
    cli,
    writes: () => writes,
    disable: () => {
      enabled = false;
    },
    advance: () => {
      revision++;
    },
  };
}

test('verified account is separate from per-session document consent and Coder cannot read', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    f.service.read(
      { ...f.context, surface: 'code' },
      { connectionId: f.connection.id, documentUrl: doc },
    ),
  );
  await assert.rejects(
    f.service.read(f.context, {
      connectionId: f.connection.id,
      documentUrl: 'https://test.feishu.cn/docx/other',
    }),
  );
  const source = await f.service.read(f.context, {
    connectionId: f.connection.id,
    documentUrl: doc,
  });
  assert.equal(source.content, 'text1');
  assert.equal(
    (await f.service.records({ ...f.context, sessionId: 'session-b' })).sources.length,
    0,
  );
  assert.equal((await f.service.records(f.context)).sources.length, 1);
  f.disable();
  await assert.rejects(
    f.service.read(f.context, { connectionId: f.connection.id, documentUrl: doc }),
  );
});

test('creating a proposal never writes; a reviewed immutable proposal commits at most once', async (t) => {
  const f = await fixture(t);
  const p = await f.service.propose(f.context, {
    connectionId: f.connection.id,
    operation: 'create',
    targetUrl: folder,
    title: 'New',
    content: 'hello',
    rationale: '',
  });
  assert.equal(f.writes(), 0);
  await assert.rejects(f.service.apply(f.context, p.id, '0'.repeat(64)));
  const result = await f.service.apply(f.context, p.id, p.contentHash);
  assert.equal(result.status, 'succeeded');
  assert.equal((await f.service.apply(f.context, p.id, p.contentHash)).status, 'succeeded');
  assert.equal(f.writes(), 1);
  assert.equal((await f.service.records(f.context)).receipts.length, 1);
});

test('append conflicts, plan mode, disconnect, and hot scope removal never dispatch writes', async (t) => {
  const f = await fixture(t);
  const p = await f.service.propose(f.context, {
    connectionId: f.connection.id,
    operation: 'append',
    targetUrl: doc,
    title: 'Test',
    content: 'append',
    rationale: '',
  });
  f.advance();
  assert.equal((await f.service.apply(f.context, p.id, p.contentHash)).status, 'conflict');
  await assert.rejects(
    f.service.propose(
      { ...f.context, permissionMode: 'plan' },
      {
        connectionId: f.connection.id,
        operation: 'create',
        targetUrl: folder,
        title: 'New',
        content: 'text',
        rationale: '',
      },
    ),
  );
  await assert.rejects(
    f.service.read(
      { ...f.context, getCurrentBindings: () => [] },
      { connectionId: f.connection.id, documentUrl: doc },
    ),
  );
  await f.service.disconnect({
    extensionId: 'partner.library',
    connectorId: 'feishu',
    connectionId: f.connection.id,
  });
  await assert.rejects(
    f.service.read(f.context, { connectionId: f.connection.id, documentUrl: doc }),
  );
  assert.equal(f.writes(), 0);
});

test('parallel approvals preserve the active submission and do not turn it into failed', async (t) => {
  const f = await fixture(t);
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((r) => {
    started = r;
  });
  const wait = new Promise<void>((r) => {
    release = r;
  });
  const create = f.cli.create;
  f.cli.create = async (input) => {
    await input.beforeDispatch?.();
    input.assertDispatch?.();
    started();
    await wait;
    return create({ ...input, beforeDispatch: undefined, assertDispatch: undefined });
  };
  const p = await f.service.propose(f.context, {
    connectionId: f.connection.id,
    operation: 'create',
    targetUrl: folder,
    title: 'New',
    content: 'body',
    rationale: '',
  });
  const first = f.service.apply(f.context, p.id, p.contentHash);
  await ready;
  const second = await f.service.apply(f.context, p.id, p.contentHash);
  assert.equal(second.status, 'submitting');
  release();
  assert.equal((await first).status, 'succeeded');
  assert.equal(f.writes(), 1);
});

test('uncertain/partial writes never get success receipts or automatic retries', async (t) => {
  for (const status of ['unknown', 'partial'] as const) {
    const f = await fixture(t);
    let calls = 0;
    f.cli.create = async (input) => {
      await input.beforeDispatch?.();
      input.assertDispatch?.();
      calls++;
      return { status };
    };
    const p = await f.service.propose(f.context, {
      connectionId: f.connection.id,
      operation: 'create',
      targetUrl: folder,
      title: 'New',
      content: 'body',
      rationale: '',
    });
    assert.equal((await f.service.apply(f.context, p.id, p.contentHash)).status, status);
    await f.service.apply(f.context, p.id, p.contentHash);
    assert.equal(calls, 1);
    assert.equal((await f.service.records(f.context)).receipts.length, 0);
  }
});

test('revocation during CLI preflight denies dispatch and rejected proposals remain unwritten', async (t) => {
  const f = await fixture(t);
  f.cli.create = async (input) => {
    f.context.getCurrentBindings = () => [];
    await input.beforeDispatch?.();
    throw new Error('must not dispatch');
  };
  const p = await f.service.propose(f.context, {
    connectionId: f.connection.id,
    operation: 'create',
    targetUrl: folder,
    title: 'New',
    content: 'body',
    rationale: '',
  });
  assert.equal((await f.service.apply(f.context, p.id, p.contentHash)).status, 'failed');
  assert.equal(f.writes(), 0);
  f.context.getCurrentBindings = () => f.context.bindings;
  const next = await f.service.propose(f.context, {
    connectionId: f.connection.id,
    operation: 'create',
    targetUrl: folder,
    title: 'New',
    content: 'body',
    rationale: '',
  });
  await f.service.reject(f.context, next.id);
  assert.equal((await f.service.apply(f.context, next.id, next.contentHash)).status, 'rejected');
});

test('after restart a dead submitting writer is unknown, never replayed', async (t) => {
  const f = await fixture(t);
  const p = await f.service.propose(f.context, {
    connectionId: f.connection.id,
    operation: 'create',
    targetUrl: folder,
    title: 'New',
    content: 'body',
    rationale: '',
  });
  const file = path.join(f.root, 'records.json');
  const state = JSON.parse(await readFile(file, 'utf8'));
  state.proposals[0].status = 'submitting';
  state.dispatchOwners[p.id] = 2147483647;
  await writeFile(file, JSON.stringify(state));
  assert.equal((await f.service.records(f.context)).proposals[0].status, 'unknown');
  assert.equal((await f.service.apply(f.context, p.id, p.contentHash)).status, 'unknown');
  assert.equal(f.writes(), 0);
});

test('two pending approvals racing at the dispatch gate cannot overwrite each other', async (t) => {
  const f = await fixture(t);
  let arrived = 0;
  let admit!: () => void;
  let finish!: () => void;
  let dispatched!: () => void;
  const gate = new Promise<void>((r) => {
    admit = r;
  });
  const completion = new Promise<void>((r) => {
    finish = r;
  });
  const writing = new Promise<void>((r) => {
    dispatched = r;
  });
  f.cli.create = async (input) => {
    arrived++;
    if (arrived === 2) admit();
    await gate;
    await input.beforeDispatch?.();
    input.assertDispatch?.();
    dispatched();
    await completion;
    return {
      status: 'success',
      documentId: 'new123',
      url: 'https://test.feishu.cn/docx/new123',
      revision: 1,
    };
  };
  const p = await f.service.propose(f.context, {
    connectionId: f.connection.id,
    operation: 'create',
    targetUrl: folder,
    title: 'New',
    content: 'body',
    rationale: '',
  });
  const a = f.service.apply(f.context, p.id, p.contentHash);
  const b = f.service.apply(f.context, p.id, p.contentHash);
  await writing;
  const loser = await Promise.race([a, b]);
  assert.equal(loser.status, 'submitting');
  finish();
  const results = await Promise.all([a, b]);
  assert.equal(results.filter((x) => x.status === 'succeeded').length, 1);
});

test('inspection contains no private identity, unchanged verification preserves session consent', async (t) => {
  const f = await fixture(t);
  const status = await f.service.inspect('partner.library', 'feishu');
  assert.equal(status.profiles[0].name, 'test');
  assert.equal(JSON.stringify(status).includes('ou_test'), false);
  const again = await f.service.connect({
    extensionId: 'partner.library',
    connectorId: 'feishu',
    profile: 'test',
  });
  assert.equal(again.revision, f.connection.revision);
  assert.equal(
    (await f.service.describeBindings(f.context.bindings)).connectors[0].available,
    true,
  );
  f.disable();
  assert.equal(
    (await f.service.describeBindings(f.context.bindings)).connectors[0].available,
    false,
  );
});

test('disable rejects new calls and waits for already dispatched write settlement', async (t) => {
  const f = await fixture(t);
  let started!: () => void;
  let release!: () => void;
  let removed = false;
  const ready = new Promise<void>((r) => {
    started = r;
  });
  const wait = new Promise<void>((r) => {
    release = r;
  });
  f.cli.create = async (input) => {
    await input.beforeDispatch?.();
    input.assertDispatch?.();
    started();
    await wait;
    return {
      status: 'success',
      documentId: 'new123',
      url: 'https://test.feishu.cn/docx/new123',
      revision: 1,
    };
  };
  const p = await f.service.propose(f.context, {
    connectionId: f.connection.id,
    operation: 'create',
    targetUrl: folder,
    title: 'New',
    content: 'body',
    rationale: '',
  });
  const applying = f.service.apply(f.context, p.id, p.contentHash);
  await ready;
  const removing = f.service.deactivate('partner.library', async () => {
    removed = true;
    f.disable();
  });
  await assert.rejects(
    f.service.read(f.context, { connectionId: f.connection.id, documentUrl: doc }),
  );
  assert.equal(removed, false);
  release();
  await applying;
  await removing;
  assert.equal(removed, true);
  assert.equal((await f.service.getProposal(f.context, p.id))?.status, 'succeeded');
});

test('scope removal during the submitting disk write still prevents business dispatch', async (t) => {
  const f = await fixture(t);
  let writes = 0;
  f.cli.create = async (input) => {
    let checks = 0;
    let revoked = false;
    f.context.getCurrentBindings = () => {
      checks++;
      if (checks === 2)
        queueMicrotask(() => {
          revoked = true;
        });
      return revoked ? [] : f.context.bindings;
    };
    await input.beforeDispatch?.();
    input.assertDispatch?.();
    writes++;
    return {
      status: 'success',
      documentId: 'new123',
      url: 'https://test.feishu.cn/docx/new123',
      revision: 1,
    };
  };
  const p = await f.service.propose(f.context, {
    connectionId: f.connection.id,
    operation: 'create',
    targetUrl: folder,
    title: 'New',
    content: 'body',
    rationale: '',
  });
  assert.equal((await f.service.apply(f.context, p.id, p.contentHash)).status, 'failed');
  assert.equal(writes, 0);
});

test('an old asynchronous verification cannot reconnect after a newer disconnect', async (t) => {
  const f = await fixture(t);
  const inspect = f.cli.inspect;
  let resume!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((r) => {
    started = r;
  });
  const wait = new Promise<void>((r) => {
    resume = r;
  });
  f.cli.inspect = async (profile) => {
    started();
    await wait;
    return inspect(profile);
  };
  const reconnect = f.service.connect({
    extensionId: 'partner.library',
    connectorId: 'feishu',
    profile: 'test',
  });
  await ready;
  await f.service.disconnect({
    extensionId: 'partner.library',
    connectorId: 'feishu',
    connectionId: f.connection.id,
  });
  resume();
  await assert.rejects(reconnect, /授权状态已改变/);
  assert.equal(
    (await f.service.describeBindings(f.context.bindings)).connectors[0].available,
    false,
  );
});

test('late revocation discards a read before returning or publishing its persisted body', async (t) => {
  const f = await fixture(t);
  const read = f.cli.read;
  f.cli.read = async (input) => {
    let checks = 0;
    let revoked = false;
    f.context.getCurrentBindings = () => {
      checks++;
      if (checks === 3)
        queueMicrotask(() => {
          revoked = true;
        });
      return revoked ? [] : f.context.bindings;
    };
    return read(input);
  };
  await assert.rejects(
    f.service.read(f.context, { connectionId: f.connection.id, documentUrl: doc }),
  );
  assert.equal((await f.service.records(f.context)).sources.length, 0);
});
