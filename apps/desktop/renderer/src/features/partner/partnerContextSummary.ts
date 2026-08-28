export type PartnerContextDetailTarget = 'sources' | 'results' | 'pendingReview';

export interface PartnerContextSummaryGroup {
  readonly count: number;
  readonly labels: readonly string[];
}

export interface PartnerContextSummary {
  readonly sources: PartnerContextSummaryGroup;
  readonly results: PartnerContextSummaryGroup;
  readonly pendingReview: PartnerContextSummaryGroup;
}

export interface PartnerContextSummaryInput {
  readonly sourceLabels: readonly string[];
  readonly pendingSourcePaths: readonly string[];
  readonly artifactLabels: readonly string[];
  readonly transientArtifactLabels: readonly string[];
  readonly deliveryPaths: readonly string[];
  readonly pendingReviewPaths: readonly string[];
}

export const EMPTY_PARTNER_CONTEXT_SUMMARY: PartnerContextSummary = {
  sources: { count: 0, labels: [] },
  results: { count: 0, labels: [] },
  pendingReview: { count: 0, labels: [] },
};

function filename(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.split('/').filter(Boolean).at(-1) ?? normalized;
}

function compactLabels(labels: readonly string[]): readonly string[] {
  const result: string[] = [];
  for (const rawLabel of labels) {
    const label = rawLabel.trim();
    if (!label || result.includes(label)) continue;
    result.push(label);
    if (result.length === 2) break;
  }
  return result;
}

export function projectPartnerContextSummary(
  input: PartnerContextSummaryInput,
): PartnerContextSummary {
  const pendingSourceLabels = input.pendingSourcePaths.map(filename);
  const deliveryLabels = input.deliveryPaths.map(filename);
  const pendingReviewLabels = input.pendingReviewPaths.map(filename);

  return {
    sources: {
      count: input.sourceLabels.length + input.pendingSourcePaths.length,
      labels: compactLabels([...input.sourceLabels, ...pendingSourceLabels]),
    },
    results: {
      count:
        input.artifactLabels.length +
        input.transientArtifactLabels.length +
        input.deliveryPaths.length,
      labels: compactLabels([
        ...input.artifactLabels,
        ...input.transientArtifactLabels,
        ...deliveryLabels,
      ]),
    },
    pendingReview: {
      count: input.pendingReviewPaths.length,
      labels: compactLabels(pendingReviewLabels),
    },
  };
}
