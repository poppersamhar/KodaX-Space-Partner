import assert from 'node:assert/strict';
import test from 'node:test';
import { spaceExtensionManifestSchema } from './space-extension.js';
import {
  connectorInvokeChannels,
  partnerConnectorSelectionSchema,
  partnerRemoteProposalSchema,
  spaceConnectorDefinitionSchema,
} from './partner-connector.js';

test('read-only providers pin their adapter and cannot inherit Feishu scope or write consent', () => {
  const connectionId = 'b6c4724a-979d-4267-9968-8ce67653c880';
  for (const [adapter, url] of [
    ['wecom-cli', 'wecom://document/Doc123'],
    ['dingtalk-cli', 'dingtalk://document/Node123'],
    ['tencent-meeting-cli', 'tmeet://meeting/1234567890123'],
  ]) {
    assert.equal(
      spaceConnectorDefinitionSchema.safeParse({
        id: 'provider',
        adapter,
        name: 'Provider',
        description: '',
      }).success,
      true,
    );
    const selection = {
      extensionId: 'partner.library',
      connectorId: 'provider',
      connectionId,
      connectionRevision: 1,
      adapter,
      documents: [{ url, access: 'read' }],
    };
    assert.equal(partnerConnectorSelectionSchema.safeParse(selection).success, true);
    assert.equal(
      partnerConnectorSelectionSchema.safeParse({
        ...selection,
        documents: [{ url, access: 'append' }],
      }).success,
      false,
    );
    assert.equal(
      partnerConnectorSelectionSchema.safeParse({
        ...selection,
        createFolderUrl: 'https://test.feishu.cn/drive/folder/Folder1',
      }).success,
      false,
    );
    assert.equal(
      partnerConnectorSelectionSchema.safeParse({ ...selection, adapter: 'feishu-cli' }).success,
      false,
    );
    assert.equal(
      partnerConnectorSelectionSchema.safeParse({
        ...selection,
        documents: [{ url: url + '?token=secret', access: 'read' }],
      }).success,
      false,
    );
  }
});

test('a Feishu connector declares a host adapter, never a command or credential', () => {
  const definition = {
    id: 'feishu-docs',
    adapter: 'feishu-cli',
    name: '飞书文档',
    description: '文档读取与受审追加',
  };
  assert.equal(spaceConnectorDefinitionSchema.parse(definition).adapter, 'feishu-cli');
  assert.equal(
    spaceConnectorDefinitionSchema.safeParse({ ...definition, command: 'bash' }).success,
    false,
  );
  assert.equal(
    spaceConnectorDefinitionSchema.safeParse({ ...definition, token: 'fixture-secret' }).success,
    false,
  );
});

test('the installed extension manifest admits the implemented Feishu adapter', () => {
  const manifest = {
    formatVersion: 1,
    hostApiVersion: 1,
    id: 'test.library',
    name: 'Library',
    description: '',
    version: '0.4.0',
    ui: { entry: 'ui/index.html', sha256: 'a'.repeat(64) },
    connectors: [{ id: 'feishu-docs', adapter: 'feishu-cli', name: '飞书文档', description: '' }],
  };
  assert.equal(spaceExtensionManifestSchema.parse(manifest).connectors.length, 1);
  assert.equal(
    spaceExtensionManifestSchema.safeParse({
      ...manifest,
      connectors: [...manifest.connectors, ...manifest.connectors],
    }).success,
    false,
  );
});

test('review submission cannot replace approved content or target and uncertain outcomes remain distinct', () => {
  const input = connectorInvokeChannels['partner.connectors.proposals.apply'].input;
  const approval = {
    sessionId: 'session1',
    projectRoot: '/test/project',
    id: 'b6c4724a-979d-4267-9968-8ce67653c880',
    expectedContentHash: 'a'.repeat(64),
  };
  assert.equal(input.safeParse(approval).success, true);
  assert.equal(input.safeParse({ ...approval, content: 'changed' }).success, false);
  assert.equal(
    input.safeParse({ ...approval, targetUrl: 'https://other.feishu.cn/docx/Other' }).success,
    false,
  );
  assert.equal(partnerRemoteProposalSchema.shape.status.safeParse('unknown').success, true);
  assert.equal(partnerRemoteProposalSchema.shape.status.safeParse('partial').success, true);
});

test('session consent pins one connection revision and an explicit document allowlist', () => {
  const selection = {
    extensionId: 'kodax.partner-library',
    connectorId: 'feishu-docs',
    connectionId: 'b6c4724a-979d-4267-9968-8ce67653c880',
    connectionRevision: 1,
    documents: [{ url: 'https://example.feishu.cn/docx/Doc123', access: 'read' }],
  };
  assert.equal(partnerConnectorSelectionSchema.parse(selection).documents[0]?.access, 'read');
  for (const url of [
    'file:///secret',
    'https://example.feishu.cn.evil.test/docx/Doc123',
    'https://u:p@example.feishu.cn/docx/Doc123',
    'https://example.feishu.cn/docx/../secret',
  ]) {
    assert.equal(
      partnerConnectorSelectionSchema.safeParse({
        ...selection,
        documents: [{ url, access: 'append' }],
      }).success,
      false,
    );
  }
  assert.equal(
    partnerConnectorSelectionSchema.safeParse({
      ...selection,
      documents: [...selection.documents, ...selection.documents],
    }).success,
    false,
  );
  assert.equal(
    partnerConnectorSelectionSchema.safeParse({ ...selection, accessToken: 'fixture-secret' })
      .success,
    false,
  );
});
