import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPartnerSceneTemplate,
  applyPartnerDeliveryInstruction,
  hasAcceptedPartnerUserMessage,
  shouldShowPartnerSceneShortcuts,
} from './partnerSceneTemplates.js';

test('delivery format remains visible in the editable draft and can be replaced or cleared', () => {
  const pdf = applyPartnerDeliveryInstruction({
    currentDraft: 'Analyze the data.',
    previousInstruction: null,
    nextInstruction: 'Delivery format: PDF.',
  });
  assert.deepEqual(pdf, {
    draft: 'Analyze the data.\n\nDelivery format: PDF.',
    instruction: 'Delivery format: PDF.',
  });
  assert.deepEqual(
    applyPartnerDeliveryInstruction({
      currentDraft: pdf.draft,
      previousInstruction: pdf.instruction,
      nextInstruction: 'Delivery format: XLSX.',
    }),
    {
      draft: 'Analyze the data.\n\nDelivery format: XLSX.',
      instruction: 'Delivery format: XLSX.',
    },
  );
  assert.deepEqual(
    applyPartnerDeliveryInstruction({
      currentDraft: pdf.draft,
      previousInstruction: pdf.instruction,
      nextInstruction: null,
    }),
    { draft: 'Analyze the data.', instruction: null },
  );
});

test('scene template inserts into an empty draft', () => {
  assert.deepEqual(
    applyPartnerSceneTemplate({
      currentDraft: '',
      previousGeneratedTemplate: null,
      nextTemplate: 'Research this market.',
    }),
    {
      draft: 'Research this market.',
      generatedTemplate: 'Research this market.',
      applied: true,
    },
  );
});

test('switching an untouched generated template replaces it', () => {
  assert.deepEqual(
    applyPartnerSceneTemplate({
      currentDraft: 'Research this market.',
      previousGeneratedTemplate: 'Research this market.',
      nextTemplate: 'Create a presentation.',
    }),
    {
      draft: 'Create a presentation.',
      generatedTemplate: 'Create a presentation.',
      applied: true,
    },
  );
});

test('switching after the user edits preserves their draft', () => {
  assert.deepEqual(
    applyPartnerSceneTemplate({
      currentDraft: 'Research the battery market for our board.',
      previousGeneratedTemplate: 'Research this market.',
      nextTemplate: 'Create a presentation.',
    }),
    {
      draft: 'Research the battery market for our board.',
      generatedTemplate: 'Research this market.',
      applied: false,
    },
  );
});

test('only accepted or canonical user messages close the new-task shortcut row', () => {
  assert.equal(
    hasAcceptedPartnerUserMessage([{ operationId: 'pending', sendAdmissionSettled: undefined }]),
    false,
  );
  assert.equal(
    hasAcceptedPartnerUserMessage([{ operationId: 'accepted', sendAdmissionSettled: true }]),
    true,
  );
  assert.equal(hasAcceptedPartnerUserMessage([{ turnId: 'turn-1' }]), true);
});

test('shortcut row is Partner-only and disappears after the first accepted send', () => {
  assert.equal(
    shouldShowPartnerSceneShortcuts({ surface: 'partner', hasAcceptedUserMessage: false }),
    true,
  );
  assert.equal(
    shouldShowPartnerSceneShortcuts({ surface: 'partner', hasAcceptedUserMessage: true }),
    false,
  );
  assert.equal(
    shouldShowPartnerSceneShortcuts({ surface: 'code', hasAcceptedUserMessage: false }),
    false,
  );
});
