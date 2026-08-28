import { useEffect, useState, type ReactNode } from 'react';
import { ArchiveRestore, FileCheck2, FileOutput, FileSearch } from 'lucide-react';
import { ArtifactsView } from '../artifact/ArtifactsView';
import {
  FOCUS_ARTIFACT_EVENT,
  OPEN_FILE_VIEWER_EVENT,
  getLastOpenedFileViewerSnapshot,
  isFileViewerSnapshot,
  type FocusArtifactEventDetail,
  type OpenFileViewerEventDetail,
  type TransientArtifactSnapshot,
} from '../artifact/transientArtifact.js';
import { FileViewer } from '../preview/FileViewer.js';
import { useI18n } from '../../i18n/I18nProvider.js';
import { useAppStore } from '../../store/appStore.js';
import { FileProposalsPanel } from './FileProposalsPanel.js';
import { DeliveriesPanel } from './DeliveriesPanel.js';
import type { PartnerResultSelectionRequest } from './partnerResultRail.js';
import { handleTablistKeyDown } from './tablistKeyboard.js';
import {
  resolveArtifactPanelDestination,
  shouldUseLegacyArtifactFileViewer,
  type ArtifactPanelDestination,
} from './artifactPanelState.js';

type ResultView = 'artifacts' | 'fileViewer' | 'files';

interface ArtifactPanelProps {
  readonly selectionRequest?: PartnerResultSelectionRequest | null;
  readonly destination?: ArtifactPanelDestination;
  readonly hideDestinationTabs?: boolean;
  readonly focusRequest?: {
    readonly revision: number;
    readonly id?: string;
    readonly snapshot?: TransientArtifactSnapshot;
  } | null;
}

export function ArtifactPanel({
  selectionRequest = null,
  destination,
  hideDestinationTabs = false,
  focusRequest = null,
}: ArtifactPanelProps): JSX.Element {
  const { t } = useI18n();
  const currentProjectPath = useAppStore((state) => state.currentProjectPath);
  const currentSessionId = useAppStore((state) => state.currentSessionId);
  const [internalDestination, setInternalDestination] =
    useState<ArtifactPanelDestination>('results');
  const [activeResultView, setActiveResultView] = useState<ResultView>('artifacts');
  const [fileViewerSnapshot, setFileViewerSnapshot] = useState<TransientArtifactSnapshot | null>(
    null,
  );
  const [focusedArtifactId, setFocusedArtifactId] = useState<string | null>(null);
  const [focusedArtifactSnapshot, setFocusedArtifactSnapshot] =
    useState<TransientArtifactSnapshot | null>(null);
  const useLegacyFileViewer = shouldUseLegacyArtifactFileViewer(hideDestinationTabs);

  useEffect(() => {
    const showFocusedArtifact = (event: Event): void => {
      const detail = (event as CustomEvent<FocusArtifactEventDetail>).detail;
      setInternalDestination('results');
      if (isFileViewerSnapshot(detail?.snapshot)) {
        setFileViewerSnapshot(detail.snapshot ?? null);
        setActiveResultView('fileViewer');
        return;
      }
      setFocusedArtifactId(detail?.id ?? detail?.snapshot?.id ?? null);
      setFocusedArtifactSnapshot(detail?.snapshot ?? null);
      setActiveResultView('artifacts');
    };
    window.addEventListener(FOCUS_ARTIFACT_EVENT, showFocusedArtifact);
    return () => window.removeEventListener(FOCUS_ARTIFACT_EVENT, showFocusedArtifact);
  }, []);

  useEffect(() => {
    if (!useLegacyFileViewer) return;
    const showFileViewer = (event: Event): void => {
      const detail = (event as CustomEvent<OpenFileViewerEventDetail>).detail;
      if (!isFileViewerSnapshot(detail?.snapshot)) return;
      setFileViewerSnapshot(detail.snapshot);
      setInternalDestination('results');
      setActiveResultView('fileViewer');
    };
    window.addEventListener(OPEN_FILE_VIEWER_EVENT, showFileViewer);
    return () => window.removeEventListener(OPEN_FILE_VIEWER_EVENT, showFileViewer);
  }, [useLegacyFileViewer]);

  useEffect(() => {
    const selection = selectionRequest?.selection;
    if (!selection) return;
    setInternalDestination(selection.destination);
    if (selection.destination === 'results') setActiveResultView(selection.view);
  }, [selectionRequest]);

  useEffect(() => {
    if (!focusRequest) return;
    setInternalDestination('results');
    setFocusedArtifactId(focusRequest.id ?? focusRequest.snapshot?.id ?? null);
    setFocusedArtifactSnapshot(focusRequest.snapshot ?? null);
    setActiveResultView('artifacts');
  }, [focusRequest]);

  useEffect(() => {
    setFileViewerSnapshot(null);
    setFocusedArtifactId(null);
    setFocusedArtifactSnapshot(null);
    setActiveResultView((current) => (current === 'fileViewer' ? 'artifacts' : current));
  }, [currentProjectPath]);

  useEffect(() => {
    setFocusedArtifactId(null);
    setFocusedArtifactSnapshot(null);
  }, [currentSessionId]);

  useEffect(() => {
    if (
      fileViewerSnapshot?.source !== 'session-attachment-preview' ||
      fileViewerSnapshot.sessionId === currentSessionId
    ) {
      return;
    }
    setFileViewerSnapshot(null);
    setActiveResultView((current) => (current === 'fileViewer' ? 'artifacts' : current));
  }, [currentSessionId, fileViewerSnapshot]);

  useEffect(() => {
    if (!useLegacyFileViewer || selectionRequest) return;
    const snapshot = getLastOpenedFileViewerSnapshot(currentProjectPath, currentSessionId);
    if (!snapshot) return;
    setFileViewerSnapshot(snapshot);
    setInternalDestination('results');
    setActiveResultView('fileViewer');
  }, [currentProjectPath, currentSessionId, selectionRequest, useLegacyFileViewer]);

  const activeDestination = resolveArtifactPanelDestination(destination, internalDestination);

  return (
    <aside
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface"
      data-testid="partner-artifact-panel"
    >
      {!hideDestinationTabs && (
        <div className="h-9 flex-shrink-0 border-b border-border-default px-3 flex items-center">
          <div
            className="flex min-w-0 items-center gap-1 rounded bg-surface-2 p-0.5"
            role="tablist"
            aria-label={t('partner.results.destinations')}
            onKeyDown={handleTablistKeyDown}
            data-testid="partner-result-destinations"
          >
            <RailTab
              id="partner-results-tab"
              controls="partner-results-panel"
              active={activeDestination === 'results'}
              onClick={() => setInternalDestination('results')}
              icon={<FileOutput className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />}
              testId="partner-results-tab"
            >
              {t('partner.results.tab.results')}
            </RailTab>
            <RailTab
              id="partner-pending-review-tab"
              controls="partner-pending-review-panel"
              active={activeDestination === 'pendingReview'}
              onClick={() => setInternalDestination('pendingReview')}
              icon={<FileCheck2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />}
              testId="partner-pending-review-tab"
            >
              {t('partner.results.tab.pendingReview')}
            </RailTab>
          </div>
        </div>
      )}

      {activeDestination === 'results' ? (
        <div
          id="partner-results-panel"
          role="tabpanel"
          aria-labelledby={hideDestinationTabs ? undefined : 'partner-results-tab'}
          aria-label={hideDestinationTabs ? t('partner.results.tab.results') : undefined}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="h-8 flex-shrink-0 border-b border-border-default px-3 flex items-center">
            <div
              className="flex min-w-0 items-center gap-1"
              role="tablist"
              aria-label={t('partner.results.views')}
              onKeyDown={handleTablistKeyDown}
            >
              <RailTab
                id="partner-results-artifacts-tab"
                controls="partner-results-artifacts-panel"
                active={activeResultView === 'artifacts'}
                onClick={() => setActiveResultView('artifacts')}
                testId="partner-results-artifacts-tab"
              >
                {t('partner.results.view.artifacts')}
              </RailTab>
              <RailTab
                id="partner-results-files-tab"
                controls="partner-results-files-panel"
                active={activeResultView === 'files'}
                onClick={() => setActiveResultView('files')}
                icon={<ArchiveRestore className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />}
                testId="partner-results-files-tab"
              >
                {t('partner.results.view.files')}
              </RailTab>
              {fileViewerSnapshot && (
                <RailTab
                  id="partner-file-viewer-tab"
                  controls="partner-file-viewer-panel"
                  active={activeResultView === 'fileViewer'}
                  onClick={() => setActiveResultView('fileViewer')}
                  icon={<FileSearch className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />}
                  testId="partner-file-viewer-tab"
                >
                  {t('partner.fileViewer.tab')}
                </RailTab>
              )}
            </div>
          </div>

          {activeResultView === 'fileViewer' && fileViewerSnapshot ? (
            <div
              id="partner-file-viewer-panel"
              role="tabpanel"
              aria-labelledby="partner-file-viewer-tab"
              className="min-h-0 flex-1"
            >
              <FileViewer snapshot={fileViewerSnapshot} onSnapshotChange={setFileViewerSnapshot} />
            </div>
          ) : activeResultView === 'artifacts' ? (
            <div
              id="partner-results-artifacts-panel"
              role="tabpanel"
              aria-labelledby="partner-results-artifacts-tab"
              className="min-h-0 flex-1"
            >
              <ArtifactsView
                focusedId={focusedArtifactId}
                focusedSnapshot={focusedArtifactSnapshot}
              />
            </div>
          ) : (
            <div
              id="partner-results-files-panel"
              role="tabpanel"
              aria-labelledby="partner-results-files-tab"
              className="min-h-0 flex-1"
            >
              <DeliveriesPanel
                selectionRequest={
                  selectionRequest?.selection.destination === 'results' &&
                  selectionRequest.selection.view === 'files'
                    ? {
                        revision: selectionRequest.revision,
                        tab: selectionRequest.selection.filesView,
                      }
                    : null
                }
              />
            </div>
          )}
        </div>
      ) : (
        <div
          id="partner-pending-review-panel"
          role="tabpanel"
          aria-labelledby={hideDestinationTabs ? undefined : 'partner-pending-review-tab'}
          aria-label={hideDestinationTabs ? t('partner.results.tab.pendingReview') : undefined}
          className="min-h-0 flex-1"
        >
          <FileProposalsPanel />
        </div>
      )}
    </aside>
  );
}

function RailTab({
  id,
  controls,
  active,
  onClick,
  icon,
  testId,
  children,
}: {
  readonly id: string;
  readonly controls: string;
  readonly active: boolean;
  readonly onClick: () => void;
  readonly icon?: ReactNode;
  readonly testId?: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <button
      id={id}
      type="button"
      role="tab"
      aria-controls={controls}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={`h-6 inline-flex items-center gap-1 rounded px-1.5 text-[11px] ${
        active
          ? 'bg-surface-raised text-fg-primary'
          : 'text-fg-muted hover:bg-hover-bg hover:text-fg-primary'
      }`}
      data-testid={testId}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}
