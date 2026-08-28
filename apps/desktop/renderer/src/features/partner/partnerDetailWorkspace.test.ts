import assert from 'node:assert/strict';
import test from 'node:test';
import {
  consumePartnerDetailOpenRequest,
  createPartnerDetailTab,
  createPartnerDetailWorkspaceState,
  partnerDetailRequestForContext,
  partnerDetailWorkspaceContextKey,
  resultSelectionForPartnerDetailRequest,
  reducePartnerDetailWorkspace,
  type PartnerDetailWorkspaceContext,
  type PartnerDetailOpenRequest,
  type PartnerDetailTab,
} from './partnerDetailWorkspace.js';

const workspaceContext: PartnerDetailWorkspaceContext = {
  projectRoot: '/workspace/project-a',
  sessionId: 'session-a',
};

const sourcesTab: PartnerDetailTab = {
  id: 'sources-1',
  kind: 'sources',
  title: '资料',
};

const resultsTab: PartnerDetailTab = {
  id: 'results-1',
  kind: 'results',
  title: '成果',
};

const terminalTab: PartnerDetailTab = {
  id: 'terminal-1',
  kind: 'terminal',
  title: '终端',
};

test('Partner detail workspace opens every card selection as an active tab', () => {
  let state = createPartnerDetailWorkspaceState();
  state = reducePartnerDetailWorkspace(state, { type: 'open', tab: sourcesTab });
  state = reducePartnerDetailWorkspace(state, { type: 'open', tab: resultsTab });

  assert.deepEqual(state.tabs, [sourcesTab, resultsTab]);
  assert.equal(state.activeId, resultsTab.id);
});

test('Partner detail launcher keeps existing tabs and clears only the active selection', () => {
  let state = createPartnerDetailWorkspaceState();
  state = reducePartnerDetailWorkspace(state, { type: 'open', tab: sourcesTab });
  state = reducePartnerDetailWorkspace(state, { type: 'show-launcher' });

  assert.deepEqual(state.tabs, [sourcesTab]);
  assert.equal(state.activeId, null);
});

test('closing the active tab selects the next tab, then falls back to the previous tab', () => {
  let state = createPartnerDetailWorkspaceState();
  state = reducePartnerDetailWorkspace(state, { type: 'open', tab: sourcesTab });
  state = reducePartnerDetailWorkspace(state, { type: 'open', tab: resultsTab });
  state = reducePartnerDetailWorkspace(state, { type: 'open', tab: terminalTab });
  state = reducePartnerDetailWorkspace(state, { type: 'select', id: resultsTab.id });

  state = reducePartnerDetailWorkspace(state, { type: 'close', id: resultsTab.id });
  assert.deepEqual(state.tabs, [sourcesTab, terminalTab]);
  assert.equal(state.activeId, terminalTab.id);

  state = reducePartnerDetailWorkspace(state, { type: 'close', id: terminalTab.id });
  assert.deepEqual(state.tabs, [sourcesTab]);
  assert.equal(state.activeId, sourcesTab.id);
});

test('closing a background tab preserves the active tab', () => {
  let state = createPartnerDetailWorkspaceState();
  state = reducePartnerDetailWorkspace(state, { type: 'open', tab: sourcesTab });
  state = reducePartnerDetailWorkspace(state, { type: 'open', tab: terminalTab });
  state = reducePartnerDetailWorkspace(state, { type: 'close', id: sourcesTab.id });

  assert.deepEqual(state.tabs, [terminalTab]);
  assert.equal(state.activeId, terminalTab.id);
});

test('detail requests project result and review targets onto the existing result selection model', () => {
  const resultsRequest: PartnerDetailOpenRequest = {
    revision: 4,
    context: workspaceContext,
    target: {
      kind: 'results',
      selection: {
        destination: 'results',
        view: 'files',
        filesView: 'checkpoints',
      },
    },
  };
  const reviewRequest: PartnerDetailOpenRequest = {
    revision: 5,
    context: workspaceContext,
    target: { kind: 'pendingReview' },
  };

  assert.deepEqual(resultSelectionForPartnerDetailRequest(resultsRequest), {
    revision: 4,
    selection: {
      destination: 'results',
      view: 'files',
      filesView: 'checkpoints',
    },
  });
  assert.deepEqual(resultSelectionForPartnerDetailRequest(reviewRequest), {
    revision: 5,
    selection: { destination: 'pendingReview' },
  });
});

test('a file preview request becomes its own detail tab with the real snapshot and title attached', () => {
  const snapshot = {
    id: 'file-brief',
    kind: 'markdown' as const,
    title: 'brief.md',
    source: 'file-preview' as const,
    path: 'brief.md',
  };

  assert.deepEqual(createPartnerDetailTab({ kind: 'file', snapshot }, 'Files', 12), {
    id: 'partner-detail-file-12',
    kind: 'file',
    title: 'brief.md',
    snapshot,
  });
});

test('a consumed detail request clears only the matching revision', () => {
  const request: PartnerDetailOpenRequest = {
    revision: 8,
    context: workspaceContext,
    target: { kind: 'sources', openPicker: true },
  };

  assert.equal(consumePartnerDetailOpenRequest(request, 8), null);
  assert.equal(consumePartnerDetailOpenRequest(request, 7), request);
});

test('detail requests and workspace instances are scoped to project and session context', () => {
  const request: PartnerDetailOpenRequest = {
    revision: 9,
    context: workspaceContext,
    target: { kind: 'file', snapshot: { id: 'a', kind: 'markdown', title: 'a.md' } },
  };
  const nextSession = { ...workspaceContext, sessionId: 'session-b' };
  const nextProject = { projectRoot: '/workspace/project-b', sessionId: null };

  assert.equal(partnerDetailRequestForContext(request, workspaceContext), request);
  assert.equal(partnerDetailRequestForContext(request, nextSession), null);
  assert.equal(partnerDetailRequestForContext(request, nextProject), null);
  assert.notEqual(
    partnerDetailWorkspaceContextKey(workspaceContext),
    partnerDetailWorkspaceContextKey(nextSession),
  );
  assert.notEqual(
    partnerDetailWorkspaceContextKey(workspaceContext),
    partnerDetailWorkspaceContextKey(nextProject),
  );
});
