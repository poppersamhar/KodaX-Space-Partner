import type {
  PartnerResultDestination,
  PartnerResultSelectionRequest,
} from './partnerResultRail.js';
import type { TransientArtifactSnapshot } from '../artifact/transientArtifact.js';
import type {
  PartnerExpertSnapshotT,
  SpaceConnectorDefinitionT,
} from '@kodax-space/space-ipc-schema';

export type PartnerDetailTabKind =
  | 'sources'
  | 'results'
  | 'pendingReview'
  | 'files'
  | 'file'
  | 'browser'
  | 'terminal'
  | 'expert'
  | 'connector';

export interface PartnerDetailTab {
  readonly id: string;
  readonly kind: PartnerDetailTabKind;
  readonly title: string;
  readonly snapshot?: TransientArtifactSnapshot;
  readonly expert?: PartnerExpertSnapshotT;
  readonly connector?: SpaceConnectorDefinitionT;
  readonly extensionId?: string;
  readonly connectionId?: string;
}

export interface PartnerDetailWorkspaceState {
  readonly tabs: readonly PartnerDetailTab[];
  readonly activeId: string | null;
}

export type PartnerDetailOpenTarget =
  | { readonly kind: 'sources'; readonly openPicker?: boolean }
  | {
      readonly kind: 'results';
      readonly selection?: PartnerResultDestination;
      readonly focusArtifact?: {
        readonly id?: string;
        readonly snapshot?: TransientArtifactSnapshot;
      };
    }
  | { readonly kind: 'pendingReview' }
  | { readonly kind: 'files' }
  | { readonly kind: 'file'; readonly snapshot: TransientArtifactSnapshot }
  | { readonly kind: 'browser' }
  | { readonly kind: 'terminal' }
  | { readonly kind: 'expert'; readonly expert: PartnerExpertSnapshotT }
  | {
      readonly kind: 'connector';
      readonly extensionId: string;
      readonly connector: SpaceConnectorDefinitionT;
      readonly connectionId?: string;
    };

export interface PartnerDetailWorkspaceContext {
  readonly projectRoot: string | null;
  readonly sessionId: string | null;
}

export interface PartnerDetailOpenRequest {
  readonly revision: number;
  readonly context?: PartnerDetailWorkspaceContext;
  readonly target: PartnerDetailOpenTarget;
}

export type PartnerDetailWorkspaceAction =
  | { readonly type: 'open'; readonly tab: PartnerDetailTab }
  | { readonly type: 'select'; readonly id: string }
  | { readonly type: 'close'; readonly id: string }
  | { readonly type: 'show-launcher' };

export function createPartnerDetailWorkspaceState(): PartnerDetailWorkspaceState {
  return {
    tabs: [],
    activeId: null,
  };
}

export function createPartnerDetailTab(
  target: PartnerDetailOpenTarget,
  title: string,
  uniqueId: number,
): PartnerDetailTab {
  const staticId =
    target.kind === 'sources' ||
    target.kind === 'results' ||
    target.kind === 'pendingReview' ||
    target.kind === 'files'
      ? `partner-detail-${target.kind}`
      : null;
  return {
    id:
      target.kind === 'connector'
        ? `partner-detail-connector-${target.extensionId}-${target.connector.id}${target.connectionId ? `-${target.connectionId}` : ''}`
        : target.kind === 'expert'
          ? `partner-detail-expert-${target.expert.extensionId}-${target.expert.expert.id}`
          : (staticId ?? `partner-detail-${target.kind}-${uniqueId}`),
    kind: target.kind,
    title:
      target.kind === 'connector'
        ? target.connector.name
        : target.kind === 'expert'
          ? target.expert.expert.name
          : target.kind === 'file'
            ? target.snapshot.title
            : title,
    ...(target.kind === 'file' ? { snapshot: target.snapshot } : {}),
    ...(target.kind === 'expert' ? { expert: target.expert } : {}),
    ...(target.kind === 'connector'
      ? {
          connector: target.connector,
          extensionId: target.extensionId,
          connectionId: target.connectionId,
        }
      : {}),
  };
}

export function consumePartnerDetailOpenRequest(
  request: PartnerDetailOpenRequest | null,
  consumedRevision: number,
): PartnerDetailOpenRequest | null {
  return request?.revision === consumedRevision ? null : request;
}

export function partnerDetailRequestForContext(
  request: PartnerDetailOpenRequest | null,
  context: PartnerDetailWorkspaceContext,
): PartnerDetailOpenRequest | null {
  const requestContext = request?.context;
  if (
    !requestContext ||
    requestContext.projectRoot !== context.projectRoot ||
    requestContext.sessionId !== context.sessionId
  ) {
    return null;
  }
  return request;
}

export function partnerDetailWorkspaceContextKey(context: PartnerDetailWorkspaceContext): string {
  return JSON.stringify([context.projectRoot, context.sessionId]);
}

export function reducePartnerDetailWorkspace(
  state: PartnerDetailWorkspaceState,
  action: PartnerDetailWorkspaceAction,
): PartnerDetailWorkspaceState {
  switch (action.type) {
    case 'open': {
      const existingIndex = state.tabs.findIndex((tab) => tab.id === action.tab.id);
      const tabs =
        existingIndex === -1
          ? [...state.tabs, action.tab]
          : state.tabs.map((tab, index) => (index === existingIndex ? action.tab : tab));
      return { tabs, activeId: action.tab.id };
    }
    case 'select':
      return state.tabs.some((tab) => tab.id === action.id)
        ? { ...state, activeId: action.id }
        : state;
    case 'show-launcher':
      return { ...state, activeId: null };
    case 'close': {
      const closingIndex = state.tabs.findIndex((tab) => tab.id === action.id);
      if (closingIndex === -1) return state;

      const tabs = state.tabs.filter((tab) => tab.id !== action.id);
      if (state.activeId !== action.id) return { ...state, tabs };

      const nextTab = tabs[closingIndex] ?? tabs[closingIndex - 1];
      return {
        tabs,
        activeId: nextTab?.id ?? null,
      };
    }
  }
}

export function resultSelectionForPartnerDetailRequest(
  request: PartnerDetailOpenRequest | null,
): PartnerResultSelectionRequest | null {
  if (request?.target.kind === 'results') {
    return {
      revision: request.revision,
      selection: request.target.selection ?? { destination: 'results', view: 'artifacts' },
    };
  }
  if (request?.target.kind === 'pendingReview') {
    return {
      revision: request.revision,
      selection: { destination: 'pendingReview' },
    };
  }
  return null;
}
