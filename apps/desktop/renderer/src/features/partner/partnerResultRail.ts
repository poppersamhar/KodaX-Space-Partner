export interface PartnerResultRailPresence {
  readonly artifactCount: number;
  readonly deliveryCount: number;
  /** Includes pending, applied, and rejected proposals so review history remains reachable. */
  readonly fileProposalCount: number;
}

export interface PartnerResultRailState {
  readonly available: boolean;
  readonly open: boolean;
}

export type PartnerResultRailSignal =
  | {
      readonly source: 'artifact';
      readonly sessionId?: string;
      readonly reason: 'created' | 'version' | 'deleted';
    }
  | {
      readonly source: 'delivery';
      readonly sessionId: string;
      readonly reason: 'created' | 'updated' | 'deleted' | 'checkpoint' | 'rollback';
    }
  | {
      readonly source: 'file-proposal';
      readonly sessionId: string;
      readonly projectRoot: string;
      readonly status: 'pending' | 'applied' | 'rejected';
      readonly reason: 'created' | 'updated';
    };

export type PartnerResultDestination =
  | { readonly destination: 'results'; readonly view: 'artifacts' }
  | {
      readonly destination: 'results';
      readonly view: 'files';
      readonly filesView: 'deliveries' | 'checkpoints';
    }
  | { readonly destination: 'pendingReview' };

export interface PartnerResultSelectionRequest {
  readonly revision: number;
  readonly selection: PartnerResultDestination;
}

export function isPartnerResultRailPresenceConclusive(
  presence: PartnerResultRailPresence,
  successfulSourceCount: number,
): boolean {
  return (
    presence.artifactCount > 0 ||
    presence.deliveryCount > 0 ||
    presence.fileProposalCount > 0 ||
    successfulSourceCount === 3
  );
}

export function projectPartnerResultRail(
  presence: PartnerResultRailPresence,
  preferredOpen: boolean,
): PartnerResultRailState {
  const available =
    presence.artifactCount > 0 || presence.deliveryCount > 0 || presence.fileProposalCount > 0;
  return { available, open: available && preferredOpen };
}

export function shouldRevealPartnerResultRail(
  selected: { readonly sessionId: string | null; readonly projectRoot: string | null },
  signal: PartnerResultRailSignal,
): boolean {
  if (selected.sessionId === null || signal.sessionId !== selected.sessionId) return false;
  if (signal.source === 'artifact') return signal.reason === 'created';
  if (signal.source === 'delivery') {
    return signal.reason === 'created' || signal.reason === 'checkpoint';
  }
  return (
    selected.projectRoot !== null &&
    signal.projectRoot === selected.projectRoot &&
    signal.reason === 'created' &&
    signal.status === 'pending'
  );
}

export function destinationForPartnerResultSignal(
  selected: { readonly sessionId: string | null; readonly projectRoot: string | null },
  signal: PartnerResultRailSignal,
): PartnerResultDestination | null {
  if (!shouldRevealPartnerResultRail(selected, signal)) return null;
  if (signal.source === 'artifact') return { destination: 'results', view: 'artifacts' };
  if (signal.source === 'delivery') {
    return {
      destination: 'results',
      view: 'files',
      filesView: signal.reason === 'checkpoint' ? 'checkpoints' : 'deliveries',
    };
  }
  return { destination: 'pendingReview' };
}
