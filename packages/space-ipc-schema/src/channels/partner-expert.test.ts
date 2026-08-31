import assert from 'node:assert/strict';
import test from 'node:test';
import {
  spaceExpertDefinitionSchema,
  partnerExpertSnapshotSchema,
  spaceExpertRefSchema,
  spaceExpertSaveInputSchema,
} from './partner-expert.js';

test('a prompt-only expert has no implicit Skill and snapshots preserve its revision', () => {
  const expert = spaceExpertDefinitionSchema.parse({
    id: 'writing-mentor',
    revision: 1,
    name: '论文写作导师',
    description: '协助论文写作',
    prompt: '以论文导师的角色协助结构、证据和表达，不编造引用。',
    starterTasks: [],
  });
  assert.equal(expert.skillRef, undefined);
  const snapshot = partnerExpertSnapshotSchema.parse({
    extensionId: 'kodax.partner-library',
    extensionVersion: '0.1.0',
    expert,
  });
  assert.equal(snapshot.expert.revision, 1);
  assert.equal(snapshot.expert.prompt, expert.prompt);
  assert.equal(
    spaceExpertDefinitionSchema.safeParse({ ...expert, skills: ['invented'] }).success,
    false,
  );
});

test('configured Skill names use the same syntax as the shared Skill library', () => {
  const definition = {
    id: 'mentor',
    revision: 1,
    name: '导师',
    description: '',
    prompt: '协助写作',
  };
  assert.equal(
    spaceExpertDefinitionSchema.safeParse({ ...definition, skillRef: 'writing:paper' }).success,
    true,
  );
  assert.equal(
    spaceExpertDefinitionSchema.safeParse({ ...definition, skillRef: '../paper' }).success,
    false,
  );
  assert.equal(
    spaceExpertDefinitionSchema.safeParse({ ...definition, skillRef: 'A'.repeat(80) }).success,
    false,
  );
});

test('saving an expert accepts content but cannot assign identity or bypass edit revisions', () => {
  const input = {
    extensionId: 'kodax.partner-library',
    values: { name: '导师', description: '', prompt: '帮助写作', starterTasks: [] },
  };
  assert.equal(spaceExpertSaveInputSchema.safeParse(input).success, true);
  assert.equal(
    spaceExpertSaveInputSchema.safeParse({
      ...input,
      expertId: 'user.abc',
      expectedRevision: 2,
    }).success,
    true,
  );
  assert.equal(
    spaceExpertSaveInputSchema.safeParse({ ...input, expertId: 'user.abc' }).success,
    false,
  );
  assert.equal(
    spaceExpertSaveInputSchema.safeParse({ ...input, expectedRevision: 2 }).success,
    false,
  );
  assert.equal(
    spaceExpertSaveInputSchema.safeParse({ ...input, values: { ...input.values, id: 'user.abc' } })
      .success,
    false,
  );
});

test('an explicit prompt-only choice survives both the reference and the session snapshot', () => {
  const reference = spaceExpertRefSchema.parse({
    extensionId: 'kodax.partner-library',
    expertId: 'writing-mentor',
    revision: 1,
    useSkill: false,
  });
  const snapshot = partnerExpertSnapshotSchema.parse({
    extensionId: reference.extensionId,
    extensionVersion: '0.3.0',
    useSkill: false,
    expert: {
      id: reference.expertId,
      revision: 1,
      name: '论文导师',
      description: '',
      prompt: '帮助写作',
      skillRef: 'writing:paper',
    },
  });
  assert.equal(reference.useSkill, false);
  assert.equal(snapshot.useSkill, false);
  assert.equal(snapshot.expert.skillRef, 'writing:paper');
});
