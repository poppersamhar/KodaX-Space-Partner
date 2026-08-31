import { useCallback, useEffect, useRef, useState } from 'react';
import {
  partnerConnectorSelectionSchema,
  type PartnerConnectorInspectionT,
  type SpaceConnectorDefinitionT,
} from '@kodax-space/space-ipc-schema';
import { useI18n } from '../../i18n/I18nProvider.js';
import { useAppStore } from '../../store/appStore.js';
import { useSurfaceStore } from '../../store/surface.js';
import { requestConfirm } from '../../store/confirmStore.js';
import { invokeExtensionHost, useSpaceExtensions } from './SpaceExtensionsProvider.js';
import { usePartnerConnectors } from './PartnerConnectorProvider.js';
import { expertContextMatches } from './partnerExpertBinding.js';
import { PartnerRemoteComposer } from './PartnerRemoteComposer.js';

export const connectorButtonClass =
  'rounded-md border border-border-default px-2.5 py-1.5 text-xs hover:bg-hover-bg disabled:opacity-40';
export const connectorInputClass =
  'w-full rounded-md border border-border-default bg-surface px-2 py-1.5 text-xs';

/** Account credentials stay in the CLI. This host panel handles only safe profile names and exact scope. */
export function PartnerConnectorDetails({
  extensionId,
  connector,
}: {
  readonly extensionId: string;
  readonly connector: SpaceConnectorDefinitionT;
}): JSX.Element {
  const projectRoot = useAppStore((state) => state.currentProjectPath);
  const sessionId = useAppStore((state) => state.currentSessionId);
  const surface = useSurfaceStore((state) => state.currentSurface);
  const { snapshot } = useSpaceExtensions();
  const installed = snapshot.extensions.find((item) => item.id === extensionId);
  const key = JSON.stringify([
    surface,
    projectRoot,
    sessionId,
    installed?.version,
    installed?.installedAt,
    installed?.enabled,
  ]);
  return <ConnectorDetailsContent key={key} extensionId={extensionId} connector={connector} />;
}

function ConnectorDetailsContent({
  extensionId,
  connector,
}: {
  readonly extensionId: string;
  readonly connector: SpaceConnectorDefinitionT;
}): JSX.Element {
  const { t } = useI18n();
  const context = usePartnerConnectors();
  const { catalog, snapshot: extensions } = useSpaceExtensions();
  const [inspection, setInspection] = useState<PartnerConnectorInspectionT | null>(null);
  const [profile, setProfile] = useState('');
  const [connectionId, setConnectionId] = useState('');
  const [documents, setDocuments] = useState<{ url: string; access: 'read' | 'append' }[]>([]);
  const [folder, setFolder] = useState('');
  const [writesAllowed, setWritesAllowed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(true);
  const loadRevision = useRef(0);
  const scope = context?.snapshot.context;
  const installed = extensions.extensions.find((item) => item.id === extensionId);
  const installedIdentity = installed ? `${installed.version}:${installed.installedAt}` : null;
  const isActive = useCallback((): boolean => {
    const current = catalog
      .getSnapshot()
      .extensions.find((item) => item.id === extensionId && item.enabled);
    return (
      mounted.current &&
      !!current &&
      `${current.version}:${current.installedAt}` === installedIdentity &&
      !!scope &&
      expertContextMatches(scope, {
        surface: useSurfaceStore.getState().currentSurface,
        projectRoot: useAppStore.getState().currentProjectPath,
        sessionId: useAppStore.getState().currentSessionId,
      })
    );
  }, [catalog, extensionId, installedIdentity, scope]);
  const load = useCallback(async (): Promise<void> => {
    const revision = ++loadRevision.current;
    setError(null);
    try {
      const [next, policy] = await Promise.all([
        invokeExtensionHost('partner.connectors.inspect', {
          extensionId,
          connectorId: connector.id,
        }),
        invokeExtensionHost('admin.policy.get', undefined),
      ]);
      if (!isActive() || revision !== loadRevision.current) return;
      setInspection(next);
      setWritesAllowed(policy.policy.connectors.writesAllowed);
      setProfile((current) =>
        next.profiles.some((item) => item.name === current)
          ? current
          : (next.profiles[0]?.name ?? ''),
      );
      setConnectionId((current) =>
        next.connections.some((item) => item.id === current)
          ? current
          : (next.connections.find((item) => item.connected)?.id ?? ''),
      );
    } catch (reason) {
      if (isActive() && revision === loadRevision.current)
        setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [extensionId, connector.id, isActive]);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      loadRevision.current += 1;
    };
  }, [load]);
  const savedBinding = context?.snapshot.state.connectors.find(
    (item) => item.binding.connectionId === connectionId,
  )?.binding;
  const savedScope = JSON.stringify({
    documents: savedBinding?.documents ?? [],
    folder: savedBinding?.createFolderUrl ?? '',
  });
  useEffect(() => {
    // Availability and record refreshes must not replace unsaved scope edits.
    const saved = JSON.parse(savedScope) as {
      documents: { url: string; access: 'read' | 'append' }[];
      folder: string;
    };
    setDocuments(saved.documents);
    setFolder(saved.folder);
  }, [connectionId, savedScope]);
  const perform = async (action: () => Promise<void>): Promise<void> => {
    if (busy || !isActive()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (reason) {
      if (isActive()) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (isActive()) setBusy(false);
    }
  };
  const connection = inspection?.connections.find(
    (item) => item.id === connectionId && item.connected,
  );
  const selected =
    context?.snapshot.state.connectors.some((item) => item.binding.connectionId === connectionId) ??
    false;
  const save = async (): Promise<void> => {
    if (!connection || !context) return;
    const parsed = partnerConnectorSelectionSchema.safeParse({
      extensionId,
      connectorId: connector.id,
      connectionId: connection.id,
      connectionRevision: connection.revision,
      documents: documents.map((item) => ({ ...item, url: item.url.trim() })),
      ...(folder.trim() ? { createFolderUrl: folder.trim() } : {}),
    });
    if (!parsed.success) throw new Error(t('connectors.invalidScope'));
    await context.binding.select(parsed.data);
    if (isActive()) setNotice(t('connectors.saved'));
  };
  const changePolicy = async (): Promise<void> => {
    if (
      writesAllowed === null ||
      !(await requestConfirm({ message: t('connectors.policyConfirm'), danger: true }))
    )
      return;
    if (!isActive()) return;
    const result = await invokeExtensionHost('admin.policy.set', {
      connectors: { writesAllowed: !writesAllowed },
    });
    if (isActive()) setWritesAllowed(result.policy.connectors.writesAllowed);
  };
  return (
    <div className="h-full space-y-5 overflow-y-auto p-4" data-testid="partner-connector-details">
      <header>
        <h2 className="text-base font-medium">{connector.name}</h2>
        <p className="mt-2 text-xs leading-5 text-fg-muted">{t('connectors.intro')}</p>
      </header>
      {!installed?.enabled && (
        <p role="alert" className="text-xs text-danger">
          {t('connectors.unavailable')}
        </p>
      )}
      <button
        type="button"
        className={connectorButtonClass}
        disabled={busy || !installed?.enabled}
        onClick={() => void perform(load)}
      >
        {t('connectors.refresh')}
      </button>
      {error && (
        <p role="alert" className="break-words text-xs text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-xs text-fg-muted">
          {notice}
        </p>
      )}
      {inspection?.reason && (
        <p role="status" className="break-words text-xs text-danger">
          {inspection.reason}
        </p>
      )}
      {inspection && !inspection.installed && (
        <section className="space-y-2 rounded-lg border border-border-default p-3 text-xs">
          <p>{t('connectors.missing')}</p>
          <p>{t('connectors.install')}</p>
          <code className="block break-all">npm install -g @larksuite/cli@1.0.92</code>
          <code className="block">lark-cli --help</code>
        </section>
      )}
      {inspection?.installed && (
        <section className="space-y-3 rounded-lg border border-border-default p-3 text-xs">
          <p>lark-cli {inspection.version}</p>
          <label className="block">
            {t('connectors.profile')}
            <select
              className={`${connectorInputClass} mt-2`}
              value={profile}
              onChange={(event) => setProfile(event.target.value)}
              disabled={busy}
            >
              {inspection.profiles.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.label || item.name}
                </option>
              ))}
            </select>
          </label>
          {!inspection.profiles.length && (
            <p className="text-fg-muted">{t('connectors.noProfiles')}</p>
          )}
          <button
            type="button"
            className={connectorButtonClass}
            disabled={busy || !profile}
            onClick={() =>
              void perform(async () => {
                const result = await invokeExtensionHost('partner.connectors.connect', {
                  extensionId,
                  connectorId: connector.id,
                  profile,
                });
                if (!isActive()) return;
                await load();
                if (isActive()) setConnectionId(result.connection.id);
              })
            }
          >
            {t('connectors.verify')}
          </button>
        </section>
      )}
      <section className="space-y-3 rounded-lg border border-border-default p-3 text-xs">
        <label className="block">
          {t('connectors.account')}
          <select
            className={`${connectorInputClass} mt-2`}
            value={connectionId}
            onChange={(event) => setConnectionId(event.target.value)}
            disabled={busy}
          >
            <option value="">{t('connectors.selectAccount')}</option>
            {inspection?.connections.map((item) => (
              <option key={item.id} value={item.id}>
                {item.accountLabel} · {item.profile}
                {!item.connected ? ` · ${t('connectors.unavailable')}` : ''}
              </option>
            ))}
          </select>
        </label>
        {connection && (
          <>
            <p className="text-fg-muted">
              {t(selected ? 'connectors.selected' : 'connectors.notSelected')}
            </p>
            <button
              type="button"
              className={connectorButtonClass}
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  if (
                    !(await requestConfirm({
                      message: t('connectors.disconnectConfirm'),
                      danger: true,
                    })) ||
                    !isActive()
                  )
                    return;
                  await invokeExtensionHost('partner.connectors.disconnect', {
                    extensionId,
                    connectorId: connector.id,
                    connectionId,
                  });
                  await load();
                })
              }
            >
              {t('connectors.disconnect')}
            </button>
          </>
        )}
      </section>
      {connection && (
        <section className="space-y-3 rounded-lg border border-border-default p-3 text-xs">
          <h3 className="font-medium">{t('connectors.scope')}</h3>
          <p className="text-fg-muted">{t('connectors.scopeHint')}</p>
          {documents.map((document, index) => (
            <div key={index} className="space-y-1">
              <input
                aria-label={`${t('connectors.target')} ${index + 1}`}
                className={connectorInputClass}
                value={document.url}
                disabled={busy}
                placeholder="https://example.feishu.cn/docx/…"
                onChange={(event) =>
                  setDocuments((items) =>
                    items.map((item, i) =>
                      i === index ? { ...item, url: event.target.value } : item,
                    ),
                  )
                }
              />
              <div className="flex gap-2">
                <select
                  aria-label={t('connectors.scope')}
                  className={connectorInputClass}
                  value={document.access}
                  disabled={busy}
                  onChange={(event) =>
                    setDocuments((items) =>
                      items.map((item, i) =>
                        i === index
                          ? { ...item, access: event.target.value as 'read' | 'append' }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="read">{t('connectors.read')}</option>
                  <option value="append" disabled={!connection.permissions.append}>
                    {t('connectors.append')}
                  </option>
                </select>
                <button
                  type="button"
                  className={connectorButtonClass}
                  disabled={busy}
                  aria-label={`${t('connectors.remove')} ${index + 1}`}
                  onClick={() => setDocuments((items) => items.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className={connectorButtonClass}
            disabled={busy || documents.length >= 32}
            onClick={() => setDocuments((items) => [...items, { url: '', access: 'read' }])}
          >
            {t('connectors.addDocument')}
          </button>
          <label className="block">
            {t('connectors.folder')}
            <input
              className={`${connectorInputClass} mt-2`}
              value={folder}
              disabled={busy || !connection.permissions.create}
              placeholder="https://example.feishu.cn/drive/folder/…"
              onChange={(event) => setFolder(event.target.value)}
            />
          </label>
          <button
            type="button"
            className={connectorButtonClass}
            disabled={busy || context?.snapshot.changing || !scope?.projectRoot}
            onClick={() => void perform(save)}
          >
            {t('connectors.save')}
          </button>
        </section>
      )}
      <section className="space-y-2 rounded-lg border border-border-default p-3 text-xs">
        <p>
          {t(
            writesAllowed === null
              ? 'connectors.policyUnknown'
              : writesAllowed
                ? 'connectors.policyOn'
                : 'connectors.policyOff',
          )}
        </p>
        <button
          type="button"
          className={connectorButtonClass}
          disabled={busy || writesAllowed === null || !installed?.enabled}
          onClick={() => void perform(changePolicy)}
        >
          {t(writesAllowed ? 'connectors.blockWrites' : 'connectors.allowWrites')}
        </button>
      </section>
      <PartnerRemoteComposer extensionId={extensionId} connectorId={connector.id} />
    </div>
  );
}
