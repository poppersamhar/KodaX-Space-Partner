import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import type { SpaceExpertDefinitionT } from '@kodax-space/space-ipc-schema';
import { buildRestrictedExtensionDocument } from './extensionViewPolicy.js';
import { parseExtensionFrameRequest, type ExtensionFrameRequest } from './extensionFrameBridge.js';

const browserPath = [
  chromium.executablePath(),
  ...(process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : []),
].find((path) => existsSync(path));
const preset: SpaceExpertDefinitionT = {
  id: 'writing-mentor',
  revision: 1,
  name: '写作导师',
  description: '帮助写作',
  prompt: 'Help with writing.',
  starterTasks: ['请检查这份提纲'],
};

async function openLibrary(t: TestContext, initialExperts: SpaceExpertDefinitionT[] = [preset]) {
  const browser = await chromium.launch({ executablePath: browserPath, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(2000);
  const requests: ExtensionFrameRequest[] = [];
  let experts = initialExperts;
  await page.exposeFunction('partnerTestHost', (data: unknown) => {
    const request = parseExtensionFrameRequest(data);
    if (!request) throw new Error('Unbounded package request');
    requests.push(request);
    if (request.method === 'catalog.list') return { experts };
    if (request.method === 'connector.catalog')
      return {
        connectors: [
          {
            id: 'feishu-docs',
            adapter: 'feishu-cli',
            name: '飞书文档',
            description: '读取资料并审核写入。',
          },
        ],
      };
    if (request.method === 'expert.save') {
      const saved = {
        ...request.values,
        id: request.expertId?.startsWith('user.') ? request.expertId : 'user.created',
        revision: request.expertId?.startsWith('user.') ? request.expectedRevision! + 1 : 1,
      };
      experts = [...experts.filter((entry) => entry.id !== saved.id), saved];
      return { expert: saved };
    }
    if (request.method === 'expert.delete') {
      experts = experts.filter((entry) => entry.id !== request.expertId);
      return { ok: true };
    }
    return { selected: true };
  });
  await page.setContent(
    '<iframe title="Partner library" sandbox="allow-scripts" style="width:1100px;height:1200px"></iframe>',
  );
  const html = await readFile(
    new URL('../../../../../../extensions/partner-library/ui/index.html', import.meta.url),
    'utf8',
  );
  await page.evaluate((documentHtml) => {
    const frame = document.querySelector('iframe')!;
    window.addEventListener('message', (event) => {
      if (event.source !== frame.contentWindow) return;
      if (event.data?.type === 'space-extension.ready.v1') {
        frame.contentWindow!.postMessage(
          { type: 'space-extension.init.v1', token: 'test-frame' },
          '*',
        );
      } else if (event.data?.type === 'space-extension.request.v1') {
        const request = event.data as { requestId: string; token: string };
        const host = (window as unknown as { partnerTestHost(data: unknown): Promise<unknown> })
          .partnerTestHost;
        void host(event.data).then((data) =>
          frame.contentWindow!.postMessage(
            {
              type: 'space-extension.response.v1',
              requestId: request.requestId,
              token: request.token,
              ok: true,
              data,
            },
            '*',
          ),
        );
      }
    });
    frame.srcdoc = documentHtml;
  }, buildRestrictedExtensionDocument(html));
  const frame = page.frameLocator('iframe');
  await frame.getByText('写作导师', { exact: true }).waitFor();
  return { frame, requests };
}

test(
  'the independent connector card opens only trusted configuration and never receives secrets or document content',
  { skip: !browserPath },
  async (t) => {
    const { frame, requests } = await openLibrary(t);
    await frame.getByRole('tab', { name: '连接器' }).click();
    await frame.getByRole('heading', { name: '飞书文档', exact: true }).waitFor();
    await frame.getByRole('button', { name: '设置连接与会话范围' }).click();
    await frame
      .getByText('已打开 Space 的可信配置面板；本页不收集密钥。', { exact: true })
      .waitFor();
    assert.deepEqual(
      requests
        .filter((item) => item.method === 'connector.configure')
        .map((item) => Object.keys(item).sort()),
      [['connectorId', 'method', 'requestId', 'token', 'type']],
    );
    assert.equal(await frame.locator('#connectors-panel input').count(), 0);
    assert.equal(
      requests.some((item) => item.method === 'expert.select'),
      false,
    );
  },
);

test(
  'the independent package creates an expert with explicit fields without selecting it or sending a prompt',
  { skip: !browserPath },
  async (t) => {
    const { frame, requests } = await openLibrary(t);
    await frame.getByRole('button', { name: '新建专家', exact: true }).click();
    await frame.getByLabel('专家名称', { exact: true }).fill('我的编辑');
    await frame.getByLabel('说明', { exact: true }).fill('校对文档');
    await frame.getByLabel('专家提示词', { exact: true }).fill('请帮我校对文档。');
    await frame.getByLabel('示例任务 1', { exact: true }).fill('检查这份提纲');
    await frame.getByLabel('Skill 名称（可选）', { exact: true }).fill('document-processing');
    await frame.getByRole('button', { name: '保存专家', exact: true }).click();
    await frame
      .getByText('已保存。需要重新选择专家，才会在会话中应用新版本。', { exact: true })
      .waitFor();
    const saves = requests.filter((request) => request.method === 'expert.save');
    assert.equal(saves.length, 1);
    assert.deepEqual(saves[0]?.values, {
      name: '我的编辑',
      description: '校对文档',
      prompt: '请帮我校对文档。',
      starterTasks: ['检查这份提纲'],
      skillRef: 'document-processing',
    });
    assert.equal(saves[0]?.expertId, undefined);
    assert.equal(
      requests.some((request) => request.method === 'expert.select'),
      false,
    );
  },
);

test(
  'editing a preset saves a user copy, and editing that copy retains its revision identity',
  { skip: !browserPath },
  async (t) => {
    const { frame, requests } = await openLibrary(t);
    await frame.getByRole('button', { name: '修改副本', exact: true }).click();
    await frame
      .getByText('预置专家不会被修改；保存后会创建一个属于你的副本。', { exact: true })
      .waitFor();
    assert.equal(await frame.getByLabel('专家提示词', { exact: true }).inputValue(), preset.prompt);
    await frame.getByLabel('专家名称', { exact: true }).fill('写作导师副本');
    await frame.getByRole('button', { name: '保存为我的副本', exact: true }).click();
    const userCard = frame
      .getByRole('article')
      .filter({ has: frame.getByRole('heading', { name: '写作导师副本', exact: true }) });
    await userCard.getByRole('button', { name: '编辑', exact: true }).click();
    await frame.getByLabel('说明', { exact: true }).fill('<b>这只是文本</b>');
    await frame.getByRole('button', { name: '保存新版本', exact: true }).click();
    await userCard.getByText('<b>这只是文本</b>', { exact: true }).waitFor();
    const saves = requests.filter((request) => request.method === 'expert.save');
    assert.deepEqual(
      saves.map((save) => ({ id: save.expertId, revision: save.expectedRevision })),
      [
        { id: 'writing-mentor', revision: 1 },
        { id: 'user.created', revision: 1 },
      ],
    );
    assert.equal(
      requests.some((request) => request.method === 'expert.select'),
      false,
    );
    assert.equal(await frame.getByRole('heading', { name: '写作导师', exact: true }).count(), 1);
  },
);

test(
  'only configured experts offer prompt-only selection before a Skill can be resolved',
  { skip: !browserPath },
  async (t) => {
    const configured = {
      ...preset,
      id: 'user.skill',
      name: '文档专家',
      skillRef: 'document-processing',
    };
    const { frame, requests } = await openLibrary(t, [preset, configured]);
    assert.equal(await frame.getByRole('button', { name: '仅用提示词', exact: true }).count(), 1);
    await frame.getByRole('button', { name: '仅用提示词', exact: true }).click();
    await frame.getByText('专家已选择，请在 Partner 中继续对话。', { exact: true }).waitFor();
    const selection = requests.find((request) => request.method === 'expert.select');
    assert.deepEqual(
      selection && {
        id: selection.expertId,
        revision: selection.revision,
        useSkill: selection.useSkill,
      },
      { id: 'user.skill', revision: 1, useSkill: false },
    );
  },
);

test(
  'only user experts expose deletion and the package sends the exact revision to host confirmation',
  { skip: !browserPath },
  async (t) => {
    const custom = { ...preset, id: 'user.custom', name: '我的专家', revision: 3 };
    const { frame, requests } = await openLibrary(t, [preset, custom]);
    assert.equal(await frame.getByRole('button', { name: '删除', exact: true }).count(), 1);
    await frame.getByRole('button', { name: '删除', exact: true }).click();
    await frame.getByText('已删除专家。历史会话中的专家快照仍会保留。', { exact: true }).waitFor();
    assert.equal(await frame.getByRole('heading', { name: '我的专家', exact: true }).count(), 0);
    const deletion = requests.find((request) => request.method === 'expert.delete');
    assert.ok(deletion && deletion.method === 'expert.delete');
    assert.deepEqual(deletion && { id: deletion.expertId, revision: deletion.revision }, {
      id: 'user.custom',
      revision: 3,
    });
  },
);
