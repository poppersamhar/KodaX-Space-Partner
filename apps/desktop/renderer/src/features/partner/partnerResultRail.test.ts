import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  destinationForPartnerResultSignal,
  isPartnerResultRailPresenceConclusive,
  projectPartnerResultRail,
  shouldRevealPartnerResultRail,
} from './partnerResultRail.js';

test('new result signals select the result view that contains the new content', () => {
  const selected = { sessionId: 'partner-session', projectRoot: '/workspace/project' };
  assert.deepEqual(
    destinationForPartnerResultSignal(selected, {
      source: 'artifact',
      sessionId: 'partner-session',
      reason: 'created',
    }),
    { destination: 'results', view: 'artifacts' },
  );
  assert.deepEqual(
    destinationForPartnerResultSignal(selected, {
      source: 'delivery',
      sessionId: 'partner-session',
      reason: 'created',
    }),
    { destination: 'results', view: 'files', filesView: 'deliveries' },
  );
  assert.deepEqual(
    destinationForPartnerResultSignal(selected, {
      source: 'delivery',
      sessionId: 'partner-session',
      reason: 'checkpoint',
    }),
    { destination: 'results', view: 'files', filesView: 'checkpoints' },
  );
  assert.deepEqual(
    destinationForPartnerResultSignal(selected, {
      source: 'file-proposal',
      sessionId: 'partner-session',
      projectRoot: '/workspace/project',
      status: 'pending',
      reason: 'created',
    }),
    { destination: 'pendingReview' },
  );
  assert.equal(
    destinationForPartnerResultSignal(selected, {
      source: 'delivery',
      sessionId: 'other-session',
      reason: 'created',
    }),
    null,
  );
});

test('an empty Partner session does not auto-open the result rail', () => {
  assert.deepEqual(
    projectPartnerResultRail({ artifactCount: 0, deliveryCount: 0, fileProposalCount: 0 }, true),
    { hasContent: false, open: false },
  );
});

test('an existing result makes the rail available while preserving the user open preference', () => {
  assert.deepEqual(
    projectPartnerResultRail({ artifactCount: 1, deliveryCount: 0, fileProposalCount: 0 }, false),
    { hasContent: true, open: false },
  );
  assert.deepEqual(
    projectPartnerResultRail({ artifactCount: 0, deliveryCount: 1, fileProposalCount: 0 }, true),
    { hasContent: true, open: true },
  );
  assert.deepEqual(
    projectPartnerResultRail({ artifactCount: 0, deliveryCount: 0, fileProposalCount: 1 }, true),
    { hasContent: true, open: true },
  );
});

test('partial failures cannot conclusively close a rail after a result signal', () => {
  const emptyPresence = { artifactCount: 0, deliveryCount: 0, fileProposalCount: 0 };
  assert.equal(isPartnerResultRailPresenceConclusive(emptyPresence, 2), false);
  assert.equal(isPartnerResultRailPresenceConclusive(emptyPresence, 3), true);
  assert.equal(
    isPartnerResultRailPresenceConclusive(
      { artifactCount: 0, deliveryCount: 1, fileProposalCount: 0 },
      1,
    ),
    true,
  );
});

test('only authoritative new-result signals for the selected session reveal the rail', () => {
  const selected = { sessionId: 'partner-session', projectRoot: '/workspace/project' };

  assert.equal(
    shouldRevealPartnerResultRail(selected, {
      source: 'artifact',
      sessionId: 'partner-session',
      reason: 'created',
    }),
    true,
  );
  assert.equal(
    shouldRevealPartnerResultRail(selected, {
      source: 'delivery',
      sessionId: 'partner-session',
      reason: 'created',
    }),
    true,
  );
  assert.equal(
    shouldRevealPartnerResultRail(selected, {
      source: 'delivery',
      sessionId: 'partner-session',
      reason: 'checkpoint',
    }),
    true,
  );
  assert.equal(
    shouldRevealPartnerResultRail(selected, {
      source: 'file-proposal',
      sessionId: 'partner-session',
      projectRoot: '/workspace/project',
      status: 'pending',
      reason: 'created',
    }),
    true,
  );

  assert.equal(
    shouldRevealPartnerResultRail(selected, {
      source: 'artifact',
      sessionId: 'partner-session',
      reason: 'version',
    }),
    false,
  );
  assert.equal(
    shouldRevealPartnerResultRail(selected, {
      source: 'delivery',
      sessionId: 'other-session',
      reason: 'created',
    }),
    false,
  );
  assert.equal(
    shouldRevealPartnerResultRail(selected, {
      source: 'file-proposal',
      sessionId: 'partner-session',
      projectRoot: '/workspace/other',
      status: 'pending',
      reason: 'created',
    }),
    false,
  );
  assert.equal(
    shouldRevealPartnerResultRail(selected, {
      source: 'file-proposal',
      sessionId: 'partner-session',
      projectRoot: '/workspace/project',
      status: 'applied',
      reason: 'updated',
    }),
    false,
  );
});
