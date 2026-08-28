export type ArtifactPanelDestination = 'results' | 'pendingReview';

export function resolveArtifactPanelDestination(
  controlled: ArtifactPanelDestination | undefined,
  internal: ArtifactPanelDestination,
): ArtifactPanelDestination {
  return controlled ?? internal;
}

export function shouldUseLegacyArtifactFileViewer(hideDestinationTabs: boolean): boolean {
  return !hideDestinationTabs;
}
