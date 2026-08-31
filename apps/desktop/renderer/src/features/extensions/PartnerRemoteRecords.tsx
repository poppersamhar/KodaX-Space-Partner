import { useEffect, useRef, useState } from 'react';
import type { PartnerRemoteProposalT, PartnerRemoteSourceT } from '@kodax-space/space-ipc-schema';
import { useI18n } from '../../i18n/I18nProvider.js';
import { useAppStore } from '../../store/appStore.js';
import { useSurfaceStore } from '../../store/surface.js';
import { requestConfirm } from '../../store/confirmStore.js';
import { openExternalUrl } from '../../lib/openPath.js';
import { invokeExtensionHost } from './SpaceExtensionsProvider.js';
import { usePartnerRemoteRecords } from './usePartnerRemoteRecords.js';
import { approveRemoteProposal } from './partnerRemoteActions.js';

const buttonClass =
  'rounded-md border border-border-default px-2.5 py-1.5 text-xs hover:bg-hover-bg disabled:opacity-40';
type Kind = 'sources' | 'pendingReview' | 'results';
/** Local source/proposal/delivery contracts remain local. Remote records have their own details. */
export function PartnerRemoteRecords({ kind }: { readonly kind: Kind }): JSX.Element | null {
  const { t } = useI18n();
  const projectRoot = useAppStore((state) => state.currentProjectPath);
  const sessionId = useAppStore((state) => state.currentSessionId);
  const { records, error: loadError, refresh } = usePartnerRemoteRecords();
  const [detail, setDetail] = useState<PartnerRemoteSourceT | PartnerRemoteProposalT | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  useEffect(() => {
    epoch.current += 1;
    setDetail(null);
    setError(null);
    setBusy(false);
    return () => {
      epoch.current += 1;
    };
  }, [projectRoot, sessionId, kind]);
  const entries =
    kind === 'sources'
      ? records.sources
      : kind === 'pendingReview'
        ? records.proposals
        : records.receipts;
  if (!entries.length && !loadError) return null;
  const run = async (action: (isActive: () => boolean) => Promise<void>): Promise<void> => {
    if (busy || !projectRoot || !sessionId) return;
    const captured = epoch.current;
    const isActive = () =>
      captured === epoch.current &&
      useSurfaceStore.getState().currentSurface === 'partner' &&
      useAppStore.getState().currentProjectPath === projectRoot &&
      useAppStore.getState().currentSessionId === sessionId;
    setBusy(true);
    setError(null);
    try {
      await action(isActive);
    } catch (reason) {
      if (isActive()) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (isActive()) setBusy(false);
    }
  };
  const getDetail = (id: string): void => {
    void run(async (isActive) => {
      const owner = { projectRoot: projectRoot!, sessionId: sessionId!, id };
      if (kind === 'sources') {
        const result = await invokeExtensionHost('partner.connectors.sources.get', owner);
        if (isActive()) setDetail(result.source);
      } else {
        const result = await invokeExtensionHost('partner.connectors.proposals.get', owner);
        if (isActive()) setDetail(result.proposal);
      }
    });
  };
  const approve = (proposal: PartnerRemoteProposalT): void => {
    void run(async (isActive) => {
      const owner = { projectRoot: projectRoot!, sessionId: sessionId!, id: proposal.id };
      const next = await approveRemoteProposal(proposal, {
        isActive,
        get: async () =>
          (await invokeExtensionHost('partner.connectors.proposals.get', owner)).proposal,
        confirm: async (current) =>
          requestConfirm({
            title: t('connectors.approve'),
            message: `${t('connectors.approveConfirm')}\n${current.operation === 'create' ? t('connectors.create') : t('connectors.append')}\n${current.targetUrl}\n${current.title}\nSHA-256: ${current.contentHash}`,
            danger: true,
          }),
        apply: async () =>
          (
            await invokeExtensionHost('partner.connectors.proposals.apply', {
              ...owner,
              expectedContentHash: proposal.contentHash,
            })
          ).proposal,
      });
      if (isActive() && next) {
        setDetail(next);
        await refresh();
      }
    });
  };
  const proposal = detail && 'operation' in detail ? detail : null;
  return (
    <section
      className="shrink-0 space-y-3 border-b border-border-default p-3 text-xs"
      data-testid={`partner-remote-${kind}`}
    >
      <h3 className="font-medium">
        {t(
          kind === 'sources'
            ? 'connectors.remoteSources'
            : kind === 'pendingReview'
              ? 'connectors.remoteReviews'
              : 'connectors.remoteReceipts',
        )}
      </h3>
      {(error || loadError) && (
        <p role="alert" className="break-words text-danger">
          {error ?? loadError}
        </p>
      )}
      <div className="max-h-44 space-y-2 overflow-y-auto">
        {entries.map((entry) => (
          <div key={entry.id} className="rounded-md border border-border-default p-2">
            <p className="break-words font-medium">{entry.title}</p>
            {'status' in entry && (
              <p className="mt-1 text-fg-muted">{t(`connectors.${entry.status}`)}</p>
            )}
            {'completedAt' in entry ? (
              <>
                <p className="my-1 break-all text-fg-muted">{entry.url}</p>
                <p className="text-fg-muted">
                  {entry.completedAt} · r{entry.revision}
                </p>
                <button
                  className={`${buttonClass} mt-2`}
                  type="button"
                  onClick={() => {
                    void openExternalUrl(entry.url);
                  }}
                >
                  {t('connectors.view')}
                </button>
              </>
            ) : (
              <button
                type="button"
                className={`${buttonClass} mt-2`}
                disabled={busy}
                onClick={() => getDetail(entry.id)}
              >
                {t('connectors.view')}
              </button>
            )}
          </div>
        ))}
      </div>
      {detail && (
        <div className="space-y-2 rounded-md border border-border-default bg-surface-2 p-3">
          <h4 className="font-medium">{detail.title}</h4>
          <p className="break-all">{'targetUrl' in detail ? detail.targetUrl : detail.url}</p>
          {proposal && (
            <>
              <p>
                {t('connectors.operation')}:{' '}
                {t(proposal.operation === 'create' ? 'connectors.create' : 'connectors.append')}
              </p>
              <p>{proposal.connectionId}</p>
              <p>{t(`connectors.${proposal.status}`)}</p>
              {proposal.baseRevision !== undefined && <p>r{proposal.baseRevision}</p>}
              <p className="text-fg-muted">{proposal.rationale}</p>
            </>
          )}
          <p className="text-fg-muted">
            {t(proposal ? 'connectors.content' : 'connectors.historical')}
          </p>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-5">
            {detail.content}
          </pre>
          {proposal?.error && (
            <p role="alert" className="text-danger">
              {proposal.error}
            </p>
          )}
          {proposal && ['unknown', 'partial', 'submitting'].includes(proposal.status) && (
            <p className="text-danger">{t('connectors.unsafeRetry')}</p>
          )}
          {proposal?.status === 'conflict' && (
            <p className="text-danger">{t('connectors.conflict')}</p>
          )}
          {proposal?.status === 'pending' && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={busy}
                onClick={() => approve(proposal)}
              >
                {t('connectors.approve')}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={busy}
                onClick={() =>
                  void run(async (isActive) => {
                    const result = await invokeExtensionHost(
                      'partner.connectors.proposals.reject',
                      { projectRoot: projectRoot!, sessionId: sessionId!, id: proposal.id },
                    );
                    if (isActive()) {
                      setDetail(result.proposal);
                      await refresh();
                    }
                  })
                }
              >
                {t('connectors.reject')}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
