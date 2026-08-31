import assert from 'node:assert/strict';
import test from 'node:test';
import type { PartnerExpertSnapshotT } from '@kodax-space/space-ipc-schema';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../../i18n/I18nProvider.js';
import { createPartnerDetailTab } from '../partner/partnerDetailWorkspace.js';
import {
  projectPartnerExpertDetails,
  PartnerExpertDetailsContent,
} from './PartnerExpertDetails.js';

test('expert details retain the actual snapshot in a reusable Partner detail tab', () => {
  const expert: PartnerExpertSnapshotT = {
    extensionId: 'partner-library',
    extensionVersion: '1.1.0',
    expert: {
      id: 'writing-mentor',
      revision: 1,
      name: 'Writing mentor',
      description: '',
      prompt: 'Help with writing',
      starterTasks: [],
    },
  };
  const tab = createPartnerDetailTab({ kind: 'expert', expert }, 'Expert', 1);
  const reopened = createPartnerDetailTab({ kind: 'expert', expert }, 'Expert', 2);
  assert.deepEqual(tab.expert, expert);
  assert.equal(tab.title, expert.expert.name);
  assert.equal(tab.id, reopened.id);
});

test('details show live Skill mode only for the exact selected revision and never upgrade another tab', () => {
  const saved: PartnerExpertSnapshotT = {
    extensionId: 'library',
    extensionVersion: '1.0.0',
    expert: {
      id: 'user.editor',
      revision: 1,
      name: 'Editor',
      description: '',
      prompt: 'Edit',
      starterTasks: [],
      skillRef: 'document-processing',
    },
  };
  const promptOnly = { ...saved, useSkill: false };
  assert.deepEqual(projectPartnerExpertDetails(saved, promptOnly), {
    expert: promptOnly,
    isCurrent: true,
  });
  const newer = { ...saved, expert: { ...saved.expert, revision: 2, prompt: 'New instructions' } };
  assert.deepEqual(projectPartnerExpertDetails(saved, newer), { expert: saved, isCurrent: false });
  assert.deepEqual(projectPartnerExpertDetails(saved, null), { expert: saved, isCurrent: false });
});

test('details expose a Skill switch only when configured and preserve example text for trusted copying', () => {
  const expert: PartnerExpertSnapshotT = {
    extensionId: 'library',
    extensionVersion: '1.0.0',
    expert: {
      id: 'editor',
      revision: 1,
      name: 'Editor',
      description: '',
      prompt: 'Edit',
      starterTasks: ['  Review <report>\nwith citations.  '],
    },
  };
  const render = (snapshot: PartnerExpertSnapshotT, isCurrent: boolean) =>
    renderToStaticMarkup(
      createElement(
        I18nProvider,
        null,
        createElement(PartnerExpertDetailsContent, {
          expert: snapshot,
          isCurrent,
          enabled: true,
          busy: false,
          onUseSkillChange: () => undefined,
          onCopyTask: () => undefined,
        }),
      ),
    );
  const promptOnly = render(expert, true);
  assert.doesNotMatch(promptOnly, /data-testid="expert-skill-toggle"/);
  assert.match(promptOnly, / {2}Review &lt;report&gt;\nwith citations\. {2}/);
  assert.match(promptOnly, /data-testid="expert-copy-starter-task"/);
  const configured = {
    ...expert,
    useSkill: false,
    expert: { ...expert.expert, skillRef: 'document-processing' },
  };
  assert.match(render(configured, true), /data-testid="expert-skill-toggle"/);
  assert.doesNotMatch(render(configured, true), /checked=""/);
  assert.doesNotMatch(render(configured, false), /data-testid="expert-skill-toggle"/);
});
