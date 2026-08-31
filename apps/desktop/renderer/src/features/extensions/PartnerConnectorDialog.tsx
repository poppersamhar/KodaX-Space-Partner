import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, ChevronDown, ExternalLink, FileText, Loader2, X } from 'lucide-react';
import type {
  PartnerConnectorConnectionT,
  PartnerConnectorOnboardingT,
  SpaceConnectorDefinitionT,
  SpaceExtensionT,
} from '@kodax-space/space-ipc-schema';
import { useI18n } from '../../i18n/I18nProvider.js';
import { useAppStore } from '../../store/appStore.js';
import { useSurfaceStore } from '../../store/surface.js';
import { requestConfirm } from '../../store/confirmStore.js';
import { pushToast } from '../../store/toastStore.js';
import { translateMessage } from '../../i18n/I18nProvider.js';
import { FloatingSurfaceHost } from '../../shell/FloatingSurfaceHost.js';
import { floatingSurfaceForBlockingModal } from '../../shell/floatingSurfacePolicy.js';
import { invokeExtensionHost, useSpaceExtensions } from './SpaceExtensionsProvider.js';
import { usePartnerConnectors } from './PartnerConnectorProvider.js';
import { expertContextMatches } from './partnerExpertBinding.js';
import { PartnerConnectorAdvanced } from './PartnerConnectorAdvanced.js';

const surface = floatingSurfaceForBlockingModal(
  'partner-connector-dialog',
  'Connector',
  'outside_or_escape',
);
const actionClass =
  'rounded-lg border border-border-default px-4 py-2 text-sm hover:bg-hover-bg disabled:opacity-40';
const finished = (job: PartnerConnectorOnboardingT): boolean =>
  ['needs_install', 'connected', 'cancelled', 'expired', 'failed'].includes(job.phase);

/** Browser authorization and credentials are owned by main. This dialog receives only safe job metadata. */
export function PartnerConnectorDialog({
  extension,
  connector,
  connectionId,
  onClose,
  onTry,
  onScope,
}: {
  readonly extension: SpaceExtensionT;
  readonly connector: SpaceConnectorDefinitionT;
  readonly connectionId?: string;
  readonly onClose: () => void;
  readonly onTry: () => void;
  readonly onScope: (connectionId: string) => void;
}): JSX.Element {
  const { t } = useI18n();
  const context = usePartnerConnectors();
  const { catalog } = useSpaceExtensions();
  const [storedJob, setJob] = useState<PartnerConnectorOnboardingT | null>(null);
  const jobRef = useRef<PartnerConnectorOnboardingT | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [selectedId, setSelectedId] = useState(connectionId ?? '');
  const mounted = useRef(true);
  const scope = useRef(context?.snapshot.context).current;
  const firstButton = useRef<HTMLButtonElement | null>(null);
  const isActive = useCallback(
    (): boolean =>
      mounted.current &&
      !!scope &&
      expertContextMatches(scope, {
        surface: useSurfaceStore.getState().currentSurface,
        projectRoot: useAppStore.getState().currentProjectPath,
        sessionId: useAppStore.getState().currentSessionId,
      }) &&
      catalog
        .getSnapshot()
        .extensions.some(
          (item) =>
            item.id === extension.id &&
            item.enabled &&
            item.version === extension.version &&
            item.installedAt === extension.installedAt,
        ),
    [catalog, extension.id, extension.version, extension.installedAt, scope],
  );
  const receiveJob = useCallback(
    (next: PartnerConnectorOnboardingT): void => {
      if (!isActive()) return;
      jobRef.current = next;
      setJob(next);
    },
    [isActive],
  );
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = window.kodaxSpace?.on(
      'partner.connectors.onboarding.changed',
      ({ job: next }) => {
        if (
          next.id === jobRef.current?.id &&
          next.extensionId === extension.id &&
          next.connectorId === connector.id
        )
          receiveJob(next);
      },
    );
    return () => {
      mounted.current = false;
      unsubscribe?.();
      const current = jobRef.current;
      if (current && !finished(current)) {
        void invokeExtensionHost('partner.connectors.onboarding.cancel', {
          extensionId: extension.id,
          connectorId: connector.id,
          id: current.id,
        }).catch(() => pushToast(translateMessage('connectors.cancelUnconfirmed'), 'warning'));
      }
    };
  }, [connector.id, extension.id, receiveJob]);
  const knownConnections = context?.connectorCatalog.entries.find(
    (item) => item.extensionId === extension.id && item.connector.id === connector.id,
  )?.connections;
  const accounts = knownConnections?.filter((item) => item.connected) ?? [];
  // An old completed job is not authority to revive a subsequently revoked local account.
  const job =
    storedJob?.phase === 'connected' &&
    knownConnections?.some((item) => item.id === storedJob.connection?.id && !item.connected)
      ? null
      : storedJob;
  const connection =
    accounts.find((item) => item.id === selectedId) ??
    accounts[0] ??
    (job?.phase === 'connected' ? job.connection : undefined);
  const perform = async (action: () => Promise<void>): Promise<void> => {
    if (busy || !isActive()) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (reason) {
      if (isActive()) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (isActive()) setBusy(false);
    }
  };
  const start = async (installCli: boolean): Promise<void> => {
    const owner = { extensionId: extension.id, connectorId: connector.id };
    const { job: next } = await invokeExtensionHost('partner.connectors.onboarding.start', {
      ...owner,
      installCli,
    });
    if (!isActive()) {
      if (!finished(next))
        await invokeExtensionHost('partner.connectors.onboarding.cancel', {
          ...owner,
          id: next.id,
        }).catch(() => pushToast(translateMessage('connectors.cancelUnconfirmed'), 'warning'));
      return;
    }
    receiveJob(next);
    // Recover changes emitted before the start response, without polling or exposing raw logs.
    const expectedJob = jobRef.current;
    const latest = await invokeExtensionHost('partner.connectors.onboarding.get', {
      ...owner,
      id: next.id,
    });
    if (jobRef.current === expectedJob) receiveJob(latest.job);
  };
  const close = async (): Promise<void> => {
    if (busy) return;
    if (!job || finished(job)) {
      onClose();
      return;
    }
    setCancelling(true);
    await perform(async () => {
      const result = await invokeExtensionHost('partner.connectors.onboarding.cancel', {
        extensionId: extension.id,
        connectorId: connector.id,
        id: job.id,
      });
      receiveJob(result.job);
      if (!isActive()) return;
      if (result.job.phase === 'connected') setNotice(t('connectors.cancelAlreadyConnected'));
      else if (finished(result.job)) onClose();
    });
    if (isActive()) setCancelling(false);
  };
  const tryConnection = async (account: PartnerConnectorConnectionT): Promise<void> => {
    if (!context || !scope?.projectRoot) throw new Error(t('connectors.openProject'));
    // A store refresh can start after render but before this click; never treat an
    // unloaded existing session as an empty selection and overwrite its bindings.
    const current = context.binding.getSnapshot();
    if (!isActive() || !expertContextMatches(scope, current.context))
      throw new Error(t('connectors.scopeChanged'));
    if (current.loading || current.changing) throw new Error(t('connectors.busy'));
    if (current.error) throw new Error(current.error);
    const existing = current.state.connectors.find(
      (item) => item.binding.connectionId === account.id,
    );
    if (existing && !existing.available)
      throw new Error(existing.unavailableReason ?? t('connectors.scopeChanged'));
    if (!existing)
      await context.binding.select({
        extensionId: extension.id,
        connectorId: connector.id,
        connectionId: account.id,
        connectionRevision: account.revision,
        documents: [],
      });
    if (isActive()) onTry();
  };
  const disconnect = async (account: PartnerConnectorConnectionT): Promise<void> => {
    if (
      !(await requestConfirm({
        title: t('connectors.disconnect'),
        message: t('connectors.disconnectConfirm'),
        danger: true,
      })) ||
      !isActive()
    )
      return;
    await invokeExtensionHost('partner.connectors.disconnect', {
      extensionId: extension.id,
      connectorId: connector.id,
      connectionId: account.id,
    });
    if (!isActive()) return;
    jobRef.current = null;
    setJob(null);
    await context?.refreshCatalog();
  };
  const activeJob = !!job && !finished(job);
  return (
    <FloatingSurfaceHost
      surface={surface}
      role="dialog"
      ariaLabelledBy="partner-connector-title"
      onClose={() => void close()}
      initialFocusRef={firstButton}
      testId="partner-connector-dialog"
      contentClassName="absolute inset-0 flex items-center justify-center pointer-events-none p-4"
    >
      <section className="pointer-events-auto relative flex max-h-[90vh] w-[520px] max-w-full flex-col overflow-y-auto rounded-2xl border border-border-default bg-surface p-7 shadow-2xl">
        <button
          type="button"
          aria-label={t('common.close')}
          onClick={() => void close()}
          disabled={busy}
          className="absolute right-4 top-4 rounded-md p-1.5 text-fg-muted hover:bg-hover-bg disabled:opacity-40"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent-ink">
          <FileText className="h-6 w-6" aria-hidden />
        </div>
        <h2 id="partner-connector-title" className="text-xl font-semibold text-fg-primary">
          {connector.name}
        </h2>
        <p className="mt-2 text-sm leading-6 text-fg-muted">{t('connectors.dialogDescription')}</p>
        {error && (
          <p role="alert" className="mt-4 break-words text-sm text-danger">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-4 text-sm text-fg-muted">
            {notice}
          </p>
        )}
        {context?.connectorCatalog.error && (
          <p role="alert" className="mt-4 text-xs text-danger">
            {context.connectorCatalog.error}
          </p>
        )}
        {context?.snapshot.error && context.snapshot.error !== error && (
          <p role="alert" className="mt-4 text-xs text-danger">
            {context.snapshot.error}
          </p>
        )}
        {connection ? (
          <div className="mt-6 space-y-4">
            <p className="flex items-center gap-2 text-sm text-green-600">
              <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
              {t('connectors.connected')}
            </p>
            {accounts.length > 1 ? (
              <select
                aria-label={t('connectors.account')}
                value={connection.id}
                onChange={(event) => setSelectedId(event.target.value)}
                className="w-full rounded-lg border border-border-default bg-surface px-3 py-2 text-sm"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.accountLabel}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-fg-secondary">{connection.accountLabel}</p>
            )}
            <p className="text-xs leading-5 text-fg-muted">{t('connectors.connectedHint')}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={actionClass}
                disabled={busy}
                onClick={() => void perform(() => disconnect(connection))}
              >
                {t('connectors.disconnect')}
              </button>
              <button
                type="button"
                className={`${actionClass} ml-auto`}
                disabled={busy}
                onClick={() => onScope(connection.id)}
              >
                {t('connectors.documentScope')}
              </button>
              <button
                ref={firstButton}
                type="button"
                className="btn-accent inline-flex items-center gap-1 rounded-lg px-4 py-2 text-sm disabled:opacity-40"
                disabled={
                  busy ||
                  !scope?.projectRoot ||
                  context?.snapshot.loading ||
                  context?.snapshot.changing ||
                  !!context?.snapshot.error
                }
                onClick={() => void perform(() => tryConnection(connection))}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                )}
                {t('connectors.try')}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {job && (
              <div role="status" className="rounded-xl bg-surface-2 p-4 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  {activeJob && job.phase !== 'needs_install' ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : job.phase === 'cancelled' ? (
                    <Check className="h-4 w-4" aria-hidden />
                  ) : null}
                  {t(`connectors.phase.${job.phase}`)}
                </p>
                <p className="mt-2 text-xs leading-5 text-fg-muted">
                  {job.phase === 'needs_install'
                    ? t('connectors.privateInstall')
                    : t('connectors.browserHint')}
                </p>
                {job.error && <p className="mt-2 text-xs text-danger">{job.error}</p>}
              </div>
            )}
            {(!job || (finished(job) && job.phase !== 'needs_install')) && (
              <button
                ref={firstButton}
                type="button"
                className="btn-accent w-full rounded-lg px-4 py-2.5 text-sm disabled:opacity-40"
                disabled={busy}
                onClick={() => void perform(() => start(false))}
              >
                {busy ? t('connectors.busy') : t('connectors.connect')}
              </button>
            )}
            {job?.phase === 'needs_install' && (
              <button
                ref={firstButton}
                type="button"
                className="btn-accent w-full rounded-lg px-4 py-2.5 text-sm disabled:opacity-40"
                disabled={busy}
                onClick={() => void perform(() => start(true))}
              >
                {t('connectors.installContinue')}
              </button>
            )}
            {job?.canReopen && (
              <button
                type="button"
                className={`${actionClass} inline-flex items-center gap-2`}
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await invokeExtensionHost('partner.connectors.onboarding.reopen', {
                      extensionId: extension.id,
                      connectorId: connector.id,
                      id: job.id,
                    });
                  })
                }
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
                {t('connectors.reopen')}
              </button>
            )}
            {activeJob && (
              <button
                type="button"
                className={actionClass}
                disabled={busy}
                onClick={() => void close()}
              >
                {t(cancelling ? 'connectors.cancelling' : 'connectors.cancelConnection')}
              </button>
            )}
          </div>
        )}
        {!activeJob && (
          <div className="mt-6 border-t border-border-default pt-4">
            <button
              type="button"
              aria-expanded={advanced}
              className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg-primary"
              onClick={() => setAdvanced((value) => !value)}
            >
              <ChevronDown className={`h-3.5 w-3.5 ${advanced ? 'rotate-180' : ''}`} aria-hidden />
              {t('connectors.advanced')}
            </button>
            {advanced && (
              <PartnerConnectorAdvanced
                extensionId={extension.id}
                connectorId={connector.id}
                isActive={isActive}
                onConnected={() => context?.refreshCatalog() ?? Promise.resolve()}
              />
            )}
          </div>
        )}
      </section>
    </FloatingSurfaceHost>
  );
}
