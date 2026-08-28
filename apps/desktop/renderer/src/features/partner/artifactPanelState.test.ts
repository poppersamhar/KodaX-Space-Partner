import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveArtifactPanelDestination,
  shouldUseLegacyArtifactFileViewer,
} from './artifactPanelState.js';

test('a detail-host destination overrides the legacy internal destination', () => {
  assert.equal(resolveArtifactPanelDestination('pendingReview', 'results'), 'pendingReview');
  assert.equal(resolveArtifactPanelDestination('results', 'pendingReview'), 'results');
});

test('the legacy panel keeps its internal destination when it is uncontrolled', () => {
  assert.equal(resolveArtifactPanelDestination(undefined, 'pendingReview'), 'pendingReview');
});

test('the detail host disables the legacy nested file viewer owner', () => {
  assert.equal(shouldUseLegacyArtifactFileViewer(true), false);
  assert.equal(shouldUseLegacyArtifactFileViewer(false), true);
});
