import assert from 'node:assert/strict';
import test from 'node:test';
import { projectPartnerContextSummary } from './partnerContextSummary.js';

test('projects real Partner records into compact context-card summaries', () => {
  const summary = projectPartnerContextSummary({
    sourceLabels: ['Brief.pdf', 'Research', 'Research'],
    pendingSourcePaths: ['notes/outline.md'],
    artifactLabels: ['Market report', 'Market report'],
    transientArtifactLabels: ['Chart preview'],
    deliveryPaths: ['partner-output/report.docx'],
    pendingReviewPaths: ['drafts/summary.md', 'drafts/appendix.md', 'drafts/notes.md'],
  });

  assert.deepEqual(summary, {
    sources: {
      count: 4,
      labels: ['Brief.pdf', 'Research'],
    },
    results: {
      count: 4,
      labels: ['Market report', 'Chart preview'],
    },
    pendingReview: {
      count: 3,
      labels: ['summary.md', 'appendix.md'],
    },
  });
});

test('uses filenames for paths and omits blank labels', () => {
  const summary = projectPartnerContextSummary({
    sourceLabels: [' ', 'Specs'],
    pendingSourcePaths: ['references\\brief.docx'],
    artifactLabels: [],
    transientArtifactLabels: [],
    deliveryPaths: ['/tmp/output.xlsx'],
    pendingReviewPaths: [],
  });

  assert.deepEqual(summary.sources.labels, ['Specs', 'brief.docx']);
  assert.deepEqual(summary.results.labels, ['output.xlsx']);
  assert.deepEqual(summary.pendingReview.labels, []);
});
