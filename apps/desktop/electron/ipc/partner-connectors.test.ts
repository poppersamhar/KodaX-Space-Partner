import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { IpcMainInvokeEvent, WebContents, WebFrameMain } from 'electron';
import {
  connectorInvokeChannels,
  type ChannelInput,
  type ChannelOutput,
  type InvokeChannelName,
} from '@kodax-space/space-ipc-schema';

process.env.KODAX_TEST_ONBOARDING = `partner-connector-ipc-${randomUUID()}`;
const { applySdkHomeEnv, getKodaxDir, getSpaceDataDir } = await import('../kodax/data-paths.js');
applySdkHomeEnv();
const { registerPartnerConnectorChannels } = await import('./partner-connectors.js');
const { setRendererTarget } = await import('./push.js');
type Handler = (
  input: ChannelInput<InvokeChannelName>,
  event: IpcMainInvokeEvent,
) => Promise<ChannelOutput<InvokeChannelName>> | ChannelOutput<InvokeChannelName>;
const handlers = new Map<string, Handler>();
registerPartnerConnectorChannels((name, handler) => {
  handlers.set(name, handler as Handler);
});
const mainFrame = { url: 'app://space/index.html' } as WebFrameMain;
const sender = { id: 776, mainFrame, isDestroyed: () => false } as unknown as WebContents;
setRendererTarget(() => sender);
after(async () => {
  setRendererTarget(() => null);
  await fs.rm(getKodaxDir(), { recursive: true, force: true });
});

test('all account, scope, content and apply handlers reject extension/subframes before inspecting input', async () => {
  assert.deepEqual(
    [...handlers.keys()].sort(),
    Object.keys(connectorInvokeChannels)
      .filter((name) => !name.startsWith('session.'))
      .sort(),
  );
  const child = {
    sender,
    senderFrame: { url: 'app://space/__space-extension-frame' },
  } as IpcMainInvokeEvent;
  for (const handler of handlers.values())
    await assert.rejects(
      async () => handler({} as ChannelInput<InvokeChannelName>, child),
      /primary application main frame/,
    );
  const foreign = { sender: { id: 999, mainFrame }, senderFrame: mainFrame } as IpcMainInvokeEvent;
  for (const handler of handlers.values())
    await assert.rejects(
      async () => handler({} as ChannelInput<InvokeChannelName>, foreign),
      /primary application main frame/,
    );
});

test('first records request resumes a disk-only Partner session and still rejects other projects and Coder', async (t) => {
  const { kodaxHost } = await import('../kodax/host.js');
  const { projectStore } = await import('../projects/store.js');
  const { SessionRuntimeStore, setSessionRuntimeStoreForTesting } =
    await import('../kodax/session-runtime-store.js');
  const { PartnerConnectorStore } = await import('../partner-connectors/store.js');
  const { installSessionStoreMock } = await import('../test/_helpers/session-store-mock.js');
  const { setUserConfigImpl } = await import('../kodax/user-config.js');
  await fs.mkdir(getKodaxDir(), { recursive: true });
  const directory = await fs.mkdtemp(path.join(getKodaxDir(), 'restored-'));
  const otherProject = path.join(directory, 'other-project');
  const runtime = new SessionRuntimeStore(path.join(directory, 'runtime'));
  setSessionRuntimeStoreForTesting(runtime);
  const persisted = installSessionStoreMock();
  setUserConfigImpl({
    loadConfig: (() => ({ provider: 'mock' })) as never,
    registerCustomProviders: (() => undefined) as never,
  });
  t.after(async () => {
    await kodaxHost.disposeAll();
    setSessionRuntimeStoreForTesting(null);
    setUserConfigImpl(null);
    persisted.reset();
    await fs.rm(directory, { recursive: true, force: true });
  });
  await projectStore.addOrBump(directory);
  await projectStore.addOrBump(otherProject);
  persisted.seedTagged('disk-only-partner', directory, 'partner');
  persisted.seedTagged('disk-only-coder', directory, 'code');
  await runtime.set('disk-only-partner', { provider: 'mock' });
  await runtime.set('disk-only-coder', { provider: 'mock' });
  const source = {
    id: randomUUID(),
    sessionId: 'disk-only-partner',
    projectRoot: directory,
    extensionId: 'kodax.partner-library',
    connectorId: 'feishu-docs',
    connectionId: randomUUID(),
    documentId: 'Allowed',
    url: 'https://example.feishu.cn/docx/Allowed',
    title: 'Persisted source',
    revision: 1,
    content: 'Previously read document',
    contentHash: createHash('sha256').update('Previously read document').digest('hex'),
    readAt: new Date().toISOString(),
  };
  await new PartnerConnectorStore(path.join(getSpaceDataDir(), 'partner-connectors')).mutate((db) =>
    db.sources.push(source),
  );
  assert.equal(kodaxHost.get(source.sessionId), undefined);
  const event = { sender, senderFrame: mainFrame } as IpcMainInvokeEvent;
  const records = (await handlers.get('partner.connectors.records')!(
    { sessionId: source.sessionId, projectRoot: directory },
    event,
  )) as ChannelOutput<'partner.connectors.records'>;
  assert.equal(kodaxHost.get(source.sessionId)?.surface, 'partner');
  assert.equal(records.sources[0]?.id, source.id);
  assert.equal('content' in records.sources[0]!, false);
  for (const input of [
    { sessionId: source.sessionId, projectRoot: otherProject },
    { sessionId: 'disk-only-coder', projectRoot: directory },
    { sessionId: 'missing-session', projectRoot: directory },
  ]) {
    await assert.rejects(
      async () => handlers.get('partner.connectors.records')!(input, event),
      /会话与项目不匹配/,
    );
  }
});
