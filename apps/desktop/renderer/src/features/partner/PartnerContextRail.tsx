import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, ChevronRight, FileCheck2, FileOutput, FolderOpen, Plus } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.js';
import { useAppStore } from '../../store/appStore.js';
import {
  EMPTY_PARTNER_CONTEXT_SUMMARY,
  projectPartnerContextSummary,
  type PartnerContextDetailTarget,
  type PartnerContextSummary,
} from './partnerContextSummary.js';
import { PARTNER_SOURCES_CHANGED_EVENT, readPartnerPendingSources } from './partnerWorkbench.js';

interface PartnerContextRailProps {
  readonly onOpenDetail: (target: PartnerContextDetailTarget) => void;
  readonly onAddMaterial: () => void;
}

interface ContextLoadResult {
  readonly summary: PartnerContextSummary;
  readonly failed: boolean;
}

interface ContextLoadInput {
  readonly bridge: KodaXSpaceBridge;
  readonly projectRoot: string;
  readonly sessionId: string | null;
  readonly transientArtifactLabels: readonly string[];
  readonly pendingSourcePaths: readonly string[];
}

async function loadPartnerContext(input: ContextLoadInput): Promise<ContextLoadResult> {
  const sourceRequest = input.bridge.invoke(
    'partner.sources.catalog',
    input.sessionId
      ? { projectRoot: input.projectRoot, sessionId: input.sessionId }
      : { projectRoot: input.projectRoot },
  );
  const artifactRequest = input.sessionId
    ? input.bridge.invoke('artifact.list', { sessionId: input.sessionId })
    : Promise.resolve(null);
  const deliveryRequest = input.sessionId
    ? input.bridge.invoke('partner.deliveries.list', {
        sessionId: input.sessionId,
        projectRoot: input.projectRoot,
      })
    : Promise.resolve(null);
  const proposalRequest = input.sessionId
    ? input.bridge.invoke('partner.fileProposals.list', {
        sessionId: input.sessionId,
        projectRoot: input.projectRoot,
        status: 'pending',
      })
    : Promise.resolve(null);
  const remoteRequest = input.sessionId
    ? input.bridge.invoke('partner.connectors.records', {
        sessionId: input.sessionId,
        projectRoot: input.projectRoot,
      })
    : Promise.resolve(null);
  const [sources, artifacts, deliveries, proposals, remote] = await Promise.allSettled([
    sourceRequest,
    artifactRequest,
    deliveryRequest,
    proposalRequest,
    remoteRequest,
  ]);
  const sourceLabels =
    sources.status === 'fulfilled' && sources.value.ok
      ? sources.value.data.sources.filter((source) => source.selected).map((source) => source.label)
      : [];
  const artifactLabels =
    artifacts.status === 'fulfilled' && artifacts.value?.ok
      ? artifacts.value.data.artifacts.map((artifact) => artifact.title)
      : [];
  const deliveryPaths =
    deliveries.status === 'fulfilled' && deliveries.value?.ok
      ? deliveries.value.data.deliveries.map((delivery) => delivery.relativePath)
      : [];
  const pendingReviewPaths =
    proposals.status === 'fulfilled' && proposals.value?.ok
      ? proposals.value.data.proposals.map((proposal) => proposal.targetPath)
      : [];
  const failed =
    sources.status === 'rejected' ||
    (sources.status === 'fulfilled' && !sources.value.ok) ||
    (input.sessionId !== null &&
      [artifacts, deliveries, proposals, remote].some(
        (request) => request.status === 'rejected' || !request.value?.ok,
      ));
  return {
    summary: projectPartnerContextSummary({
      sourceLabels,
      pendingSourcePaths: input.pendingSourcePaths,
      artifactLabels,
      transientArtifactLabels: input.transientArtifactLabels,
      deliveryPaths,
      pendingReviewPaths,
      ...(remote.status === 'fulfilled' && remote.value?.ok
        ? {
            remoteSourceLabels: remote.value.data.sources.map((item) => item.title),
            remoteReviewLabels: remote.value.data.proposals
              .filter((item) => !['succeeded', 'rejected'].includes(item.status))
              .map((item) => item.title),
            remoteReceiptLabels: remote.value.data.receipts.map((item) => item.title),
          }
        : {}),
    }),
    failed,
  };
}

function ContextEntry({
  testId,
  title,
  emptyLabel,
  summary,
  icon,
  onClick,
}: {
  readonly testId: string;
  readonly title: string;
  readonly emptyLabel: string;
  readonly summary: PartnerContextSummary['sources'];
  readonly icon: ReactNode;
  readonly onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full px-3 py-3 text-left transition-colors hover:bg-hover-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-border"
      aria-label={`${title}: ${summary.count}`}
      data-testid={testId}
    >
      <span className="flex items-center gap-2">
        <span className="text-fg-muted group-hover:text-fg-primary" aria-hidden>
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg-primary">{title}</span>
        <span
          className="min-w-5 rounded-full bg-surface-3 px-1.5 py-0.5 text-center text-[10px] tabular-nums text-fg-muted"
          aria-hidden
        >
          {summary.count}
        </span>
        <ChevronRight
          className="h-3.5 w-3.5 text-fg-muted transition-transform group-hover:translate-x-0.5"
          strokeWidth={1.75}
          aria-hidden
        />
      </span>
      <span className="mt-2 block min-h-8 pl-6 text-[11px] leading-4 text-fg-muted">
        {summary.labels.length > 0
          ? summary.labels.map((label) => (
              <span key={label} className="block truncate">
                {label}
              </span>
            ))
          : emptyLabel}
      </span>
    </button>
  );
}

const EMPTY_TRANSIENT_ARTIFACTS: readonly { readonly title: string }[] = [];

export function PartnerContextRail({
  onOpenDetail,
  onAddMaterial,
}: PartnerContextRailProps): JSX.Element {
  const { t } = useI18n();
  const currentProjectPath = useAppStore((state) => state.currentProjectPath);
  const currentSessionId = useAppStore((state) => state.currentSessionId);
  const transientArtifacts = useAppStore((state) =>
    currentSessionId
      ? (state.transientArtifactsBySession[currentSessionId] ?? EMPTY_TRANSIENT_ARTIFACTS)
      : EMPTY_TRANSIENT_ARTIFACTS,
  );
  const [summary, setSummary] = useState(EMPTY_PARTNER_CONTEXT_SUMMARY);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestRevisionRef = useRef(0);
  const mountedRef = useRef(true);

  const refresh = useCallback(async (): Promise<void> => {
    const bridge = window.kodaxSpace;
    const revision = ++requestRevisionRef.current;
    if (!bridge || !currentProjectPath) {
      setSummary(EMPTY_PARTNER_CONTEXT_SUMMARY);
      setLoading(false);
      setFailed(false);
      return;
    }
    setLoading(true);
    try {
      const result = await loadPartnerContext({
        bridge,
        projectRoot: currentProjectPath,
        sessionId: currentSessionId,
        transientArtifactLabels: transientArtifacts.map((artifact) => artifact.title),
        pendingSourcePaths: readPartnerPendingSources(currentProjectPath).map(
          (source) => source.label ?? source.path,
        ),
      });
      if (!mountedRef.current || revision !== requestRevisionRef.current) return;
      setSummary(result.summary);
      setFailed(result.failed);
    } catch {
      if (mountedRef.current && revision === requestRevisionRef.current) setFailed(true);
    } finally {
      if (mountedRef.current && revision === requestRevisionRef.current) setLoading(false);
    }
  }, [currentProjectPath, currentSessionId, transientArtifacts]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onSourcesChanged = (): void => void refresh();
    window.addEventListener(PARTNER_SOURCES_CHANGED_EVENT, onSourcesChanged);
    return () => window.removeEventListener(PARTNER_SOURCES_CHANGED_EVENT, onSourcesChanged);
  }, [refresh]);

  useEffect(() => {
    const bridge = window.kodaxSpace;
    if (!bridge || !currentSessionId || !currentProjectPath) return;
    const offArtifacts = bridge.on('artifact.changed', (payload) => {
      if (!payload.sessionId || payload.sessionId === currentSessionId) void refresh();
    });
    const offDeliveries = bridge.on('partner.deliveries.changed', (payload) => {
      if (payload.sessionId === currentSessionId) void refresh();
    });
    const offProposals = bridge.on('partner.fileProposals.changed', (payload) => {
      if (payload.sessionId === currentSessionId && payload.projectRoot === currentProjectPath) {
        void refresh();
      }
    });
    const offRemote = bridge.on('partner.connectors.changed', (payload) => {
      if (
        (!payload.sessionId || payload.sessionId === currentSessionId) &&
        (!payload.projectRoot || payload.projectRoot === currentProjectPath)
      )
        void refresh();
    });
    return () => {
      offArtifacts();
      offDeliveries();
      offProposals();
      offRemote();
    };
  }, [currentProjectPath, currentSessionId, refresh]);

  return (
    <aside
      className="flex h-full min-h-0 w-[300px] flex-shrink-0 flex-col bg-surface px-4 py-3"
      aria-label={`${t('partner.sources.title')}, ${t('partner.results.tab.results')}, ${t('partner.results.tab.pendingReview')}`}
      aria-busy={loading}
      data-testid="partner-context-rail"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        <div
          className="overflow-hidden rounded-xl border border-border-default bg-surface-2 shadow-sm"
          data-testid="partner-context-sources-card"
        >
          <ContextEntry
            testId="partner-context-sources"
            title={t('partner.sources.title')}
            emptyLabel={t('partner.sources.none')}
            summary={summary.sources}
            icon={<FolderOpen className="h-4 w-4" strokeWidth={1.75} />}
            onClick={() => onOpenDetail('sources')}
          />
          <div className="border-t border-border-default px-3 pb-2">
            <button
              type="button"
              onClick={onAddMaterial}
              className="mt-2 inline-flex min-h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-border-default bg-surface px-2 text-xs text-fg-secondary hover:bg-hover-bg hover:text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border"
              data-testid="partner-context-add-material"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              {t('partner.sources.add')}
            </button>
          </div>
        </div>

        <div
          className="overflow-hidden rounded-xl border border-border-default bg-surface-2 shadow-sm"
          data-testid="partner-context-pending-review-card"
        >
          <ContextEntry
            testId="partner-context-pending-review"
            title={t('partner.results.tab.pendingReview')}
            emptyLabel={t('partner.fileProposals.emptyPending')}
            summary={summary.pendingReview}
            icon={<FileCheck2 className="h-4 w-4" strokeWidth={1.75} />}
            onClick={() => onOpenDetail('pendingReview')}
          />
        </div>

        <div
          className="overflow-hidden rounded-xl border border-border-default bg-surface-2 shadow-sm"
          data-testid="partner-context-results-card"
        >
          <ContextEntry
            testId="partner-context-results"
            title={t('partner.results.tab.results')}
            emptyLabel={t('artifact.emptyTitle')}
            summary={summary.results}
            icon={<FileOutput className="h-4 w-4" strokeWidth={1.75} />}
            onClick={() => onOpenDetail('results')}
          />
        </div>
      </div>

      {failed && (
        <div className="mt-2 flex items-center gap-1.5 px-1 text-[11px] text-danger" role="status">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden />
          {t('common.unknownError')}
        </div>
      )}
    </aside>
  );
}
