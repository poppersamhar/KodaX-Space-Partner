import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spaceExtensionManifestSchema } from './space-extension.js';

test('a standalone Partner UI package declares only the supported host contract', () => {
  const manifest = spaceExtensionManifestSchema.parse({
    formatVersion: 1,
    hostApiVersion: 1,
    id: 'kodax.partner-library',
    name: 'Partner 插件库',
    description: '专家和连接器',
    version: '0.1.0',
    ui: { entry: 'ui/index.html', sha256: 'a'.repeat(64) },
  });
  assert.equal(manifest.id, 'kodax.partner-library');
  assert.deepEqual(manifest.experts, []);
  assert.deepEqual(manifest.connectors, []);
  assert.equal(manifest.ui.entry, 'ui/index.html');
});

test('expert identities must be unique within one extension package', () => {
  const expert = { id: 'mentor', revision: 1, name: '导师', description: '', prompt: '帮助写作' };
  const input = {
    formatVersion: 1,
    hostApiVersion: 1,
    id: 'partner-library',
    name: '插件',
    description: '',
    version: '1.0.0',
    ui: { entry: 'ui/index.html', sha256: 'a'.repeat(64) },
    experts: [expert, { ...expert, revision: 2 }],
  };
  assert.equal(spaceExtensionManifestSchema.safeParse(input).success, false);
});

test('a package cannot claim the host-owned user expert namespace', () => {
  const input = {
    formatVersion: 1,
    hostApiVersion: 1,
    id: 'partner-library',
    name: '插件',
    description: '',
    version: '1.0.0',
    ui: { entry: 'ui/index.html', sha256: 'a'.repeat(64) },
    experts: [{ id: 'user.abc', revision: 1, name: '导师', description: '', prompt: '帮助写作' }],
  };
  assert.equal(spaceExtensionManifestSchema.safeParse(input).success, false);
});
