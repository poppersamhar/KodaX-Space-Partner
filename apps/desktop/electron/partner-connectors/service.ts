import { createHash, randomUUID } from 'node:crypto';
import {
  partnerConnectorConnectionSchema,
  partnerConnectorSelectionsSchema,
  partnerRemoteProposalInputSchema,
  partnerRemoteProposalSchema,
  partnerRemoteSourceSchema,
  partnerRemoteReceiptSchema,
  feishuDocumentUrlSchema,
  feishuFolderUrlSchema,
  feishuProfileSchema,
  type PartnerConnectorConnectionT,
  type PartnerConnectorInspectionT,
  type PartnerConnectorSelectionT,
  type PartnerConnectorSnapshotT,
  type PartnerConnectorStateT,
  type PartnerRemoteProposalInputT,
  type PartnerRemoteProposalT,
  type PartnerRemoteSourceT,
  type PartnerRemoteRecordsT,
  type SpaceConnectorDefinitionT,
  type Surface,
  type PermissionMode,
} from '@kodax-space/space-ipc-schema';
import { FeishuCli, FeishuCliError, type FeishuWriteResult } from './feishu-cli.js';
import { PartnerConnectorStore, type ConnectorAccount } from './store.js';

export interface PartnerConnectorContext {
  sessionId: string;
  projectRoot: string;
  surface: Surface;
  permissionMode: PermissionMode;
  bindings: readonly PartnerConnectorSnapshotT[];
  getCurrentBindings?: () => readonly PartnerConnectorSnapshotT[];
  getCurrentPermissionMode?: () => PermissionMode;
}
interface Dependencies {
  cli: Pick<FeishuCli, 'inspect' | 'listProfiles' | 'read' | 'create' | 'append'>;
  catalog: (extensionId: string) => Promise<SpaceConnectorDefinitionT[]>;
  checkPolicy: (connectorId: string, write: boolean) => Promise<void>;
  getPolicyRevision?: () => number;
  changed?: (context?: { sessionId?: string; projectRoot?: string; extensionId?: string }) => void;
}
const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
const scopeHash = (binding: PartnerConnectorSnapshotT): string =>
  digest(
    JSON.stringify({
      extensionId: binding.extensionId,
      connectorId: binding.connectorId,
      connectionId: binding.connectionId,
      connectionRevision: binding.connectionRevision,
      documents: [...binding.documents].sort((a, b) => a.url.localeCompare(b.url)),
      createFolderUrl: binding.createFolderUrl,
    }),
  );
const contentHash = (input: {
  operation: string;
  targetUrl: string;
  title: string;
  content: string;
}): string =>
  digest(JSON.stringify([input.operation, input.targetUrl, input.title, input.content]));
const own = (
  context: PartnerConnectorContext,
  record: { sessionId: string; projectRoot: string },
): boolean => context.sessionId === record.sessionId && context.projectRoot === record.projectRoot;
const publicAccount = (account: ConnectorAccount): PartnerConnectorConnectionT => {
  const { appId: _appId, openId: _openId, ...value } = account;
  return partnerConnectorConnectionSchema.parse(value);
};

/** Session-local consent on top of the official CLI; never installs SDK/global tools. */
export class PartnerConnectorService {
  private readonly store: PartnerConnectorStore;
  private readonly blocked = new Map<string, number>();
  private readonly active = new Map<Promise<unknown>, string>();
  private readonly accountEpochs = new Map<string, number>();
  private revocationEpoch = 0;
  constructor(
    root: string,
    private readonly deps: Dependencies,
  ) {
    this.store = new PartnerConnectorStore(root);
  }
  async catalog(extensionId: string): Promise<SpaceConnectorDefinitionT[]> {
    if (this.blocked.has('*') || this.blocked.has(extensionId))
      throw new Error('插件正在停用或更新');
    return this.deps.catalog(extensionId);
  }
  private async definition(extensionId: string, connectorId: string) {
    const definition = (await this.catalog(extensionId)).find(
      (item) => item.id === connectorId && item.adapter === 'feishu-cli',
    );
    if (!definition) throw new Error('飞书连接器已不可用');
    return definition;
  }
  async inspect(extensionId: string, connectorId: string): Promise<PartnerConnectorInspectionT> {
    await this.definition(extensionId, connectorId);
    const status = await this.deps.cli.inspect('default');
    const profiles = status.installed ? await this.deps.cli.listProfiles().catch(() => []) : [];
    return {
      installed: status.installed,
      ...(status.version ? { version: status.version } : {}),
      ...(status.reason ? { reason: status.reason } : {}),
      profiles,
      connections: (await this.store.read()).connections
        .filter((item) => item.extensionId === extensionId && item.connectorId === connectorId)
        .map(publicAccount),
    };
  }
  async connect(input: {
    extensionId: string;
    connectorId: string;
    profile: string;
  }): Promise<PartnerConnectorConnectionT> {
    const startedEpoch = this.revocationEpoch;
    const started = (await this.store.read()).connections.find(
      (item) =>
        item.extensionId === input.extensionId &&
        item.connectorId === input.connectorId &&
        item.profile === input.profile,
    );
    await this.definition(input.extensionId, input.connectorId);
    await this.deps.checkPolicy(input.connectorId, false);
    const status = await this.deps.cli.inspect(feishuProfileSchema.parse(input.profile));
    if (!status.installed || status.version !== '1.0.92' || !status.identity)
      throw new Error(status.reason ?? '请先在官方飞书 CLI 配置并登录用户账号');
    const identity = status.identity;
    await this.definition(input.extensionId, input.connectorId);
    const connection = await this.store.mutate((db) => {
      const old = db.connections.find(
        (item) =>
          item.extensionId === input.extensionId &&
          item.connectorId === input.connectorId &&
          item.profile === input.profile,
      );
      const permissions = {
        read: identity.scopes.includes('docx:document:readonly'),
        create: identity.scopes.includes('docx:document:create'),
        append: identity.scopes.includes('docx:document:write_only'),
      };
      if (this.revocationEpoch !== startedEpoch || old?.revision !== started?.revision)
        throw new Error('连接期间授权状态已改变，请重新验证');
      if (
        old?.connected &&
        old.appId === identity.appId &&
        old.openId === identity.openId &&
        JSON.stringify(old.permissions) === JSON.stringify(permissions)
      )
        return publicAccount(old);
      const record: ConnectorAccount = {
        id: old?.id ?? randomUUID(),
        ...input,
        revision: (old?.revision ?? 0) + 1,
        accountLabel: identity.label,
        connected: true,
        permissions,
        appId: identity.appId,
        openId: identity.openId,
      };
      if (old) db.connections[db.connections.indexOf(old)] = record;
      else db.connections.push(record);
      return publicAccount(record);
    });
    if (connection.revision !== started?.revision)
      this.accountEpochs.set(connection.id, (this.accountEpochs.get(connection.id) ?? 0) + 1);
    this.deps.changed?.({ extensionId: input.extensionId });
    return connection;
  }
  async disconnect(input: {
    extensionId: string;
    connectorId: string;
    connectionId: string;
  }): Promise<void> {
    this.revocationEpoch++;
    this.accountEpochs.set(
      input.connectionId,
      (this.accountEpochs.get(input.connectionId) ?? 0) + 1,
    );
    await this.store.mutate((db) => {
      const account = db.connections.find(
        (item) =>
          item.id === input.connectionId &&
          item.extensionId === input.extensionId &&
          item.connectorId === input.connectorId,
      );
      if (!account) throw new Error('连接不存在');
      account.connected = false;
      account.revision++;
    });
    await Promise.allSettled(
      [...this.active].filter(([, id]) => id === input.extensionId).map(([promise]) => promise),
    );
    this.deps.changed?.({ extensionId: input.extensionId });
  }
  async resolveSelections(
    selections: readonly PartnerConnectorSelectionT[],
  ): Promise<PartnerConnectorSnapshotT[]> {
    const result: PartnerConnectorSnapshotT[] = [];
    for (const selection of partnerConnectorSelectionsSchema.parse(selections)) {
      const definition = await this.definition(selection.extensionId, selection.connectorId);
      const account = await this.account(selection);
      const status = await this.deps.cli.inspect(account.profile);
      if (
        !status.installed ||
        status.version !== '1.0.92' ||
        !status.identity ||
        status.identity.appId !== account.appId ||
        status.identity.openId !== account.openId
      )
        throw new Error('飞书账号已变化，请重新连接并确认范围');
      if (selection.documents.length && !status.identity.scopes.includes('docx:document:readonly'))
        throw new Error('飞书账号缺少文档读取权限');
      if (
        selection.documents.some((item) => item.access === 'append') &&
        !status.identity.scopes.includes('docx:document:write_only')
      )
        throw new Error('飞书账号缺少文档追加权限');
      if (selection.createFolderUrl && !status.identity.scopes.includes('docx:document:create'))
        throw new Error('飞书账号缺少新建文档权限');
      await this.account(selection);
      result.push({ ...selection, name: definition.name, accountLabel: account.accountLabel });
    }
    return result;
  }
  async describeBindings(
    bindings: readonly PartnerConnectorSnapshotT[],
  ): Promise<PartnerConnectorStateT> {
    return {
      connectors: await Promise.all(
        bindings.map(async (binding) => {
          try {
            await this.definition(binding.extensionId, binding.connectorId);
            await this.account(binding);
            return { binding, available: true };
          } catch {
            return {
              binding,
              available: false,
              unavailableReason: '连接器或账号已停用，请重新连接并确认文档范围',
            };
          }
        }),
      ),
    };
  }
  private async account(binding: PartnerConnectorSelectionT): Promise<ConnectorAccount> {
    const record = (await this.store.read()).connections.find(
      (item) =>
        item.id === binding.connectionId &&
        item.extensionId === binding.extensionId &&
        item.connectorId === binding.connectorId &&
        item.revision === binding.connectionRevision &&
        item.connected,
    );
    if (!record) throw new Error('连接已断开或授权版本变化，请重新选择');
    return record;
  }
  private assertContext(context: PartnerConnectorContext): void {
    if (context.surface !== 'partner') throw new Error('连接器只允许在 Partner 会话使用');
  }
  private async authorize(
    context: PartnerConnectorContext,
    connectionId: string,
    targetUrl: string,
    operation: 'read' | 'create' | 'append',
  ) {
    this.assertContext(context);
    const binding = context.bindings.find((item) => item.connectionId === connectionId);
    const current = (context.getCurrentBindings?.() ?? context.bindings).find(
      (item) => item.connectionId === connectionId,
    );
    if (!binding || !current || scopeHash(binding) !== scopeHash(current))
      throw new Error('会话连接器范围已撤销或改变');
    if (operation === 'create') {
      feishuFolderUrlSchema.parse(targetUrl);
      if (binding.createFolderUrl !== targetUrl) throw new Error('未授权在此文件夹新建文档');
    } else {
      feishuDocumentUrlSchema.parse(targetUrl);
      const scope = binding.documents.find((item) => item.url === targetUrl);
      if (!scope || (operation === 'append' && scope.access !== 'append'))
        throw new Error('文档不在本会话授权范围内');
    }
    if (
      operation !== 'read' &&
      (context.permissionMode === 'plan' || context.getCurrentPermissionMode?.() === 'plan')
    )
      throw new Error('计划模式不允许远端写入提案或提交');
    const accountEpoch = this.accountEpochs.get(connectionId) ?? 0;
    const policyRevision = this.deps.getPolicyRevision?.() ?? 0;
    await this.definition(binding.extensionId, binding.connectorId);
    await this.deps.checkPolicy(binding.connectorId, operation !== 'read');
    const account = await this.account(binding);
    // No await after this live check until the caller's next operation.
    const latest = (context.getCurrentBindings?.() ?? context.bindings).find(
      (item) => item.connectionId === connectionId,
    );
    if (!latest || scopeHash(latest) !== scopeHash(binding)) throw new Error('会话授权已撤销');
    const assertLive = () => {
      const latest = (context.getCurrentBindings?.() ?? context.bindings).find(
        (item) => item.connectionId === connectionId,
      );
      if (
        !latest ||
        scopeHash(latest) !== scopeHash(binding) ||
        this.blocked.has('*') ||
        this.blocked.has(binding.extensionId) ||
        (this.accountEpochs.get(connectionId) ?? 0) !== accountEpoch ||
        (this.deps.getPolicyRevision?.() ?? 0) !== policyRevision
      )
        throw new Error('会话、账号或策略授权已改变');
      if (
        operation !== 'read' &&
        (context.permissionMode === 'plan' || context.getCurrentPermissionMode?.() === 'plan')
      )
        throw new Error('计划模式不允许远端写入');
    };
    assertLive();
    return {
      binding,
      account,
      assertLive,
      args: {
        profile: account.profile,
        expected: { appId: account.appId, openId: account.openId },
      },
    };
  }
  async read(
    context: PartnerConnectorContext,
    input: { connectionId: string; documentUrl: string },
  ): Promise<PartnerRemoteSourceT> {
    const auth = await this.authorize(context, input.connectionId, input.documentUrl, 'read');
    const document = await this.deps.cli.read({
      ...auth.args,
      documentUrl: input.documentUrl,
      beforeRead: async () => {
        await this.authorize(context, input.connectionId, input.documentUrl, 'read');
      },
      assertRead: auth.assertLive,
    });
    await this.authorize(context, input.connectionId, input.documentUrl, 'read');
    if (
      document.url !== input.documentUrl ||
      document.documentId !== input.documentUrl.split('/').at(-1)
    )
      throw new Error('飞书返回的文档与请求不一致');
    const source = partnerRemoteSourceSchema.parse({
      id: randomUUID(),
      sessionId: context.sessionId,
      projectRoot: context.projectRoot,
      extensionId: auth.binding.extensionId,
      connectorId: auth.binding.connectorId,
      connectionId: input.connectionId,
      ...document,
      contentHash: digest(document.content),
      readAt: new Date().toISOString(),
    });
    await this.store.mutate((db) => {
      db.sources = db.sources.filter(
        (item) =>
          !(
            own(context, item) &&
            item.connectionId === input.connectionId &&
            item.url === input.documentUrl
          ),
      );
      db.sources.push(source);
    });
    try {
      auth.assertLive();
    } catch (error) {
      await this.store.mutate((db) => {
        db.sources = db.sources.filter((item) => item.id !== source.id);
      });
      throw error;
    }
    this.deps.changed?.(context);
    return source;
  }
  async propose(
    context: PartnerConnectorContext,
    value: PartnerRemoteProposalInputT,
  ): Promise<PartnerRemoteProposalT> {
    const input = partnerRemoteProposalInputSchema.parse(value);
    const auth = await this.authorize(
      context,
      input.connectionId,
      input.targetUrl,
      input.operation,
    );
    const base =
      input.operation === 'append'
        ? await this.deps.cli.read({
            ...auth.args,
            documentUrl: input.targetUrl,
            beforeRead: async () => {
              await this.authorize(context, input.connectionId, input.targetUrl, input.operation);
            },
            assertRead: auth.assertLive,
          })
        : undefined;
    await this.authorize(context, input.connectionId, input.targetUrl, input.operation);
    const now = new Date().toISOString();
    const proposal = partnerRemoteProposalSchema.parse({
      ...input,
      id: randomUUID(),
      sessionId: context.sessionId,
      projectRoot: context.projectRoot,
      extensionId: auth.binding.extensionId,
      connectorId: auth.binding.connectorId,
      connectionRevision: auth.binding.connectionRevision,
      contentHash: contentHash(input),
      scopeHash: scopeHash(auth.binding),
      ...(base ? { baseRevision: base.revision, baseContentHash: digest(base.content) } : {}),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
    await this.store.mutate((db) => {
      db.proposals.push(proposal);
    });
    try {
      auth.assertLive();
    } catch (error) {
      await this.finish(proposal, 'rejected', '生成期间授权已撤销，提案未交付');
      throw error;
    }
    this.deps.changed?.(context);
    return proposal;
  }
  async records(context: PartnerConnectorContext): Promise<PartnerRemoteRecordsT> {
    this.assertContext(context);
    // Also reconciles dead writers; only metadata leaves this list endpoint.
    const db = await this.store.readReconciled();
    return {
      sources: db.sources
        .filter((item) => own(context, item))
        .slice(-200)
        .map(({ content: _content, ...item }) => item),
      proposals: db.proposals
        .filter((item) => own(context, item))
        .slice(-200)
        .map(({ content: _content, ...item }) => item),
      receipts: db.receipts.filter((item) => own(context, item)).slice(-200),
    };
  }
  async getSource(
    context: PartnerConnectorContext,
    id: string,
  ): Promise<PartnerRemoteSourceT | null> {
    this.assertContext(context);
    return (
      (await this.store.read()).sources.find((item) => item.id === id && own(context, item)) ?? null
    );
  }
  async getProposal(
    context: PartnerConnectorContext,
    id: string,
  ): Promise<PartnerRemoteProposalT | null> {
    this.assertContext(context);
    return (
      (await this.store.read()).proposals.find((item) => item.id === id && own(context, item)) ??
      null
    );
  }
  async reject(context: PartnerConnectorContext, id: string): Promise<PartnerRemoteProposalT> {
    this.assertContext(context);
    const proposal = await this.store.mutate((db) => {
      const p = db.proposals.find((item) => item.id === id && own(context, item));
      if (!p) throw new Error('提案不存在');
      if (p.status === 'pending') {
        p.status = 'rejected';
        p.updatedAt = new Date().toISOString();
      }
      return p;
    });
    this.deps.changed?.(context);
    return proposal;
  }
  async apply(
    context: PartnerConnectorContext,
    id: string,
    expectedContentHash: string,
  ): Promise<PartnerRemoteProposalT> {
    this.assertContext(context);
    const p = await this.getProposal(context, id);
    if (!p) throw new Error('提案不存在');
    if (p.contentHash !== expectedContentHash || contentHash(p) !== expectedContentHash)
      throw new Error('提案内容变化，请重新审核');
    if (p.status !== 'pending') return p;
    const promise = this.submit(context, p);
    this.active.set(promise, p.extensionId);
    try {
      return await promise;
    } finally {
      this.active.delete(promise);
      this.deps.changed?.(context);
    }
  }
  private async submit(
    context: PartnerConnectorContext,
    p: PartnerRemoteProposalT,
  ): Promise<PartnerRemoteProposalT> {
    let claimed = false;
    let dispatched = false;
    try {
      const auth = await this.authorize(context, p.connectionId, p.targetUrl, p.operation);
      if (
        auth.binding.connectionRevision !== p.connectionRevision ||
        scopeHash(auth.binding) !== p.scopeHash
      )
        throw new Error('提案授权范围已变化');
      if (p.operation === 'append') {
        const base = await this.deps.cli.read({
          ...auth.args,
          documentUrl: p.targetUrl,
          beforeRead: async () => {
            await this.authorize(context, p.connectionId, p.targetUrl, p.operation);
          },
          assertRead: auth.assertLive,
        });
        if (base.revision !== p.baseRevision || digest(base.content) !== p.baseContentHash)
          return this.finish(p, 'conflict', '飞书文档已变化，请读取最新内容并创建新提案');
      }
      const beforeDispatch = async () => {
        const currentAuth = await this.authorize(context, p.connectionId, p.targetUrl, p.operation);
        await this.store.mutate((db) => {
          const current = db.proposals.find((item) => item.id === p.id);
          if (current?.status !== 'pending' || current.contentHash !== p.contentHash)
            throw new Error('提案已经处理，请刷新状态');
          if (
            !db.connections.some(
              (account) =>
                account.id === p.connectionId &&
                account.revision === p.connectionRevision &&
                account.connected,
            )
          )
            throw new Error('连接授权已撤销');
          current.status = 'submitting';
          current.updatedAt = new Date().toISOString();
          db.dispatchOwners[p.id] = process.pid;
        });
        claimed = true;
        currentAuth.assertLive();
        auth.assertLive();
      };
      const assertDispatch = () => {
        auth.assertLive();
        if (!claimed) throw new Error('未完成持久化提交门');
        dispatched = true;
      };
      const result: FeishuWriteResult =
        p.operation === 'create'
          ? await this.deps.cli.create({
              ...auth.args,
              folderUrl: p.targetUrl,
              title: p.title,
              text: p.content,
              beforeDispatch,
              assertDispatch,
            })
          : await this.deps.cli.append({
              ...auth.args,
              documentUrl: p.targetUrl,
              baseRevision: p.baseRevision!,
              text: p.content,
              beforeRead: async () => {
                await this.authorize(context, p.connectionId, p.targetUrl, p.operation);
              },
              assertRead: auth.assertLive,
              beforeDispatch,
              assertDispatch,
            });
      if (!dispatched) throw new Error('CLI 适配没有经过审核提交门');
      if (result.status !== 'success')
        return this.finish(
          p,
          result.status,
          '提交结果未完全确认，请到飞书核对；不会自动重试',
          claimed,
        );
      const receipt = partnerRemoteReceiptSchema.parse({
        id: randomUUID(),
        sessionId: p.sessionId,
        projectRoot: p.projectRoot,
        extensionId: p.extensionId,
        connectorId: p.connectorId,
        connectionId: p.connectionId,
        proposalId: p.id,
        operation: p.operation,
        documentId: result.documentId,
        url: result.url,
        title: p.title,
        revision: result.revision,
        completedAt: new Date().toISOString(),
      });
      if (p.operation === 'append' && receipt.url !== p.targetUrl)
        throw new Error('飞书回执目标不一致');
      return this.store.mutate((db) => {
        const current = db.proposals.find((item) => item.id === p.id)!;
        current.status = 'succeeded';
        current.updatedAt = receipt.completedAt;
        db.receipts.push(receipt);
        delete db.dispatchOwners[p.id];
        return current;
      });
    } catch (error) {
      if (error instanceof FeishuCliError && error.code === 'revision_changed' && !dispatched)
        return this.finish(p, 'conflict', '飞书文档已变化，请创建新提案');
      // Preflight errors cannot write; once dispatch is admitted, uncertainty is permanent.
      return this.finish(
        p,
        dispatched || (error instanceof FeishuCliError && error.dispatched) ? 'unknown' : 'failed',
        dispatched
          ? '提交未确认，请到飞书核对；不会自动重试'
          : '提交前检查失败，请确认插件、账号、范围和策略后创建新提案',
        claimed,
      );
    }
  }
  private finish(
    p: PartnerRemoteProposalT,
    status: PartnerRemoteProposalT['status'],
    error: string,
    ownsDispatch = false,
  ): Promise<PartnerRemoteProposalT> {
    return this.store.mutate((db) => {
      const current = db.proposals.find((item) => item.id === p.id)!;
      if (current.status !== 'pending' && !(current.status === 'submitting' && ownsDispatch))
        return current;
      current.status = status;
      current.error = error;
      current.updatedAt = new Date().toISOString();
      delete db.dispatchOwners[p.id];
      return current;
    });
  }
  async deactivate<T>(extensionId: string | undefined, operation: () => Promise<T>): Promise<T> {
    this.revocationEpoch++;
    const key = extensionId ?? '*';
    this.blocked.set(key, (this.blocked.get(key) ?? 0) + 1);
    try {
      await Promise.allSettled(
        [...this.active].filter(([, id]) => key === '*' || id === key).map(([promise]) => promise),
      );
      return await operation();
    } finally {
      const count = this.blocked.get(key)! - 1;
      if (count) this.blocked.set(key, count);
      else this.blocked.delete(key);
    }
  }
}
