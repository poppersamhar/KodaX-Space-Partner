import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { after, afterEach, before, test } from 'node:test';
import JSZip from 'jszip';
import type { PartnerExpertSnapshotT, SessionEvent } from '@kodax-space/space-ipc-schema';

// Scope Space and SDK before importing any of their singleton stores or providers.
process.env.KODAX_TEST_ONBOARDING = `expert-runtime-${randomUUID()}`;
process.env.KODAX_SPACE_ENABLE_SDK_EXTENSIONS = '0';
const { applySdkHomeEnv, getKodaxDir } = await import('./data-paths.js');
applySdkHomeEnv();
const profileDirectory = getKodaxDir();
const { RealKodaXSession } = await import('./real-session.js');
const { kodaxHost } = await import('./host.js');
const { SessionRuntimeStore, setSessionRuntimeStoreForTesting } =
  await import('./session-runtime-store.js');
const { setRendererTarget } = await import('../ipc/push.js');
setRendererTarget(() => null);
const { getSpaceExtensionStore, getSpaceExpertCatalog } =
  await import('../space-extensions/runtime.js');
const { setPartnerExpertForIpc } = await import('../ipc/session.js');
const { KodaXBaseProvider, registerModelProvider } = await import('@kodax-ai/kodax/llm');
const { awaitLatestCodingMemoryReviewDrain } = await import('@kodax-ai/kodax/coding');
const projectRoot = path.join(profileDirectory, 'project');
const boundaryProjectRoot = path.join(profileDirectory, 'boundary-project');
const systems: string[] = [];
const sessions: InstanceType<typeof RealKodaXSession>[] = [];
let writingExpert: PartnerExpertSnapshotT;
let researchExpert: PartnerExpertSnapshotT;
let skillExpert: PartnerExpertSnapshotT;
let missingSkillExpert: PartnerExpertSnapshotT;
const restrictedSkillKinds = ['dynamic', 'hook', 'fork'] as const;
const restrictedExperts = new Map<string, PartnerExpertSnapshotT>();
let beforeResponse: (() => Promise<void>) | undefined;

class RecordingProvider extends KodaXBaseProvider {
  readonly name = 'space-expert-runtime-test';
  readonly supportsThinking = false;
  protected readonly config = {
    apiKeyEnv: 'SPACE_EXPERT_TEST_UNUSED',
    model: 'test-model',
    supportsThinking: false,
  };
  override isConfigured(): boolean {
    return true;
  }
  async stream(
    ...args: Parameters<InstanceType<typeof KodaXBaseProvider>['stream']>
  ): Promise<Awaited<ReturnType<InstanceType<typeof KodaXBaseProvider>['stream']>>> {
    if (args[2].includes('KodaX Space Partner surface profile:')) {
      systems.push(args[2]);
      await beforeResponse?.();
    }
    return {
      textBlocks: [{ type: 'text', text: 'Done.' }],
      toolBlocks: [],
      thinkingBlocks: [],
      stopReason: 'end_turn',
    };
  }
}

before(async () => {
  await fs.mkdir(projectRoot, { recursive: true });
  const skillDirectory = path.join(projectRoot, '.kodax', 'skills', 'expert-default-fixture');
  await fs.mkdir(skillDirectory, { recursive: true });
  await fs.writeFile(
    path.join(skillDirectory, 'SKILL.md'),
    '---\nname: expert-default-fixture\ndescription: A drafting rubric\n---\nEXPERT_DEFAULT_SKILL_BODY\nApply this rubric to: $ARGUMENTS\n',
  );
  const explicitDirectory = path.join(projectRoot, '.kodax', 'skills', 'expert-explicit-fixture');
  await fs.mkdir(explicitDirectory, { recursive: true });
  await fs.writeFile(
    path.join(explicitDirectory, 'SKILL.md'),
    '---\nname: expert-explicit-fixture\ndescription: A user chosen rubric\n---\nEXPERT_EXPLICIT_SKILL_BODY\nThe explicit task is: $ARGUMENTS\n',
  );
  for (const kind of restrictedSkillKinds) {
    const name = `expert-${kind}-fixture`;
    const directory = path.join(boundaryProjectRoot, '.kodax', 'skills', name);
    const command = `touch "${path.join(boundaryProjectRoot, `${kind}-must-not-run`)}"`;
    const extra =
      kind === 'fork'
        ? 'context: fork\n'
        : kind === 'hook'
          ? `hooks:\n  SessionStart:\n    - command: ${JSON.stringify(command)}\n`
          : '';
    const body = kind === 'hook' ? 'A role with a shell hook.' : `!\`${command}\``;
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(
      path.join(directory, 'SKILL.md'),
      `---\nname: ${name}\ndescription: Boundary fixture\n${extra}---\n${body}\n`,
    );
  }
  const html = '<!doctype html><title>Expert fixture</title>';
  const zip = new JSZip();
  zip.file(
    'manifest.json',
    JSON.stringify({
      formatVersion: 1,
      hostApiVersion: 1,
      id: 'partner.library',
      name: 'Fixture experts',
      description: 'Local execution fixture',
      version: '1.0.0',
      ui: { entry: 'ui/index.html', sha256: createHash('sha256').update(html).digest('hex') },
      experts: [
        {
          id: 'writing-guide',
          revision: 1,
          name: 'Writing guide',
          description: 'Drafting',
          prompt: 'EXPERT-WRITING: Keep original meaning.',
          starterTasks: [],
        },
        {
          id: 'research-guide',
          revision: 1,
          name: 'Research guide',
          description: 'Research',
          prompt: 'EXPERT-RESEARCH: Explain evidence and limitations.',
          starterTasks: [],
        },
        {
          id: 'skill-guide',
          revision: 1,
          name: 'Skill guide',
          description: 'Expert with one Skill',
          prompt: 'EXPERT-SKILLED: Preserve meaning and apply the chosen rubric.',
          starterTasks: [],
          skillRef: 'expert-default-fixture',
        },
        {
          id: 'missing-skill-guide',
          revision: 1,
          name: 'Missing Skill guide',
          description: 'Previously bound Skill is unavailable',
          prompt: 'EXPERT-MISSING-SKILL: Preserve the selected role.',
          starterTasks: [],
          skillRef: 'expert-missing-fixture',
        },
        ...restrictedSkillKinds.map((kind) => ({
          id: `${kind}-guide`,
          revision: 1,
          name: `${kind} guide`,
          description: 'Partner boundary fixture',
          prompt: 'EXPERT-BOUNDARY: The role does not grant shell authority.',
          starterTasks: [],
          skillRef: `expert-${kind}-fixture`,
        })),
      ],
      connectors: [],
    }),
  );
  zip.file('ui/index.html', html);
  const archive = path.join(profileDirectory, 'fixture.space-extension');
  await fs.writeFile(archive, await zip.generateAsync({ type: 'nodebuffer' }));
  await getSpaceExtensionStore().install(archive);
  await getSpaceExtensionStore().setEnabled('partner.library', true);
  writingExpert = await getSpaceExpertCatalog().resolve({
    extensionId: 'partner.library',
    expertId: 'writing-guide',
    revision: 1,
  });
  researchExpert = await getSpaceExpertCatalog().resolve({
    extensionId: 'partner.library',
    expertId: 'research-guide',
    revision: 1,
  });
  skillExpert = await getSpaceExpertCatalog().resolve({
    extensionId: 'partner.library',
    expertId: 'skill-guide',
    revision: 1,
  });
  missingSkillExpert = await getSpaceExpertCatalog().resolve({
    extensionId: 'partner.library',
    expertId: 'missing-skill-guide',
    revision: 1,
  });
  for (const kind of restrictedSkillKinds) {
    restrictedExperts.set(
      kind,
      await getSpaceExpertCatalog().resolve({
        extensionId: 'partner.library',
        expertId: `${kind}-guide`,
        revision: 1,
      }),
    );
  }
});

const unregisterProvider = registerModelProvider(
  'space-expert-runtime-test',
  () => new RecordingProvider(),
);
after(async () => {
  await awaitLatestCodingMemoryReviewDrain(2_000);
  unregisterProvider();
  await fs.rm(profileDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});
afterEach(async () => {
  beforeResponse = undefined;
  await Promise.all(sessions.splice(0).map((session) => session.dispose()));
  await kodaxHost.disposeAll();
  setSessionRuntimeStoreForTesting(null);
  await awaitLatestCodingMemoryReviewDrain(2_000);
  systems.length = 0;
});

function makeSession(expert?: PartnerExpertSnapshotT, workingDirectory = projectRoot) {
  const events: SessionEvent[] = [];
  const session = new RealKodaXSession({
    sessionId: `expert-${randomUUID()}`,
    projectRoot: workingDirectory,
    provider: 'space-expert-runtime-test',
    reasoningMode: 'off',
    permissionMode: 'plan',
    agentMode: 'sa',
    surface: 'partner',
    partnerExpert: expert,
    emit: (event) => events.push(event),
    requestPermission: async () => 'deny',
  });
  sessions.push(session);
  return { session, events };
}

function makeHostSession(expert: PartnerExpertSnapshotT) {
  const { sessionId } = kodaxHost.createSession({
    projectRoot,
    provider: 'space-expert-runtime-test',
    reasoningMode: 'off',
    permissionMode: 'plan',
    agentMode: 'sa',
    surface: 'partner',
    partnerExpert: expert,
  });
  const session = kodaxHost.get(sessionId);
  assert.ok(session);
  return session;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Partner expert runtime test timed out');
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

test('real Partner sends include the selected role on every SDK run without leaking to another Session', async () => {
  const first = makeSession(writingExpert);
  const second = makeSession(researchExpert);
  await first.session.send('Review this sentence.');
  await waitFor(() => !first.session.isRunning());
  await first.session.send('Review the next sentence.');
  await waitFor(() => !first.session.isRunning());
  await second.session.send('Summarize this source.');
  await waitFor(() => !second.session.isRunning());

  assert.equal(systems.length, 3);
  assert.ok(systems[0]!.includes('EXPERT-WRITING'));
  assert.ok(systems[1]!.includes('EXPERT-WRITING'));
  assert.ok(!systems[0]!.includes('EXPERT-RESEARCH'));
  assert.ok(systems[2]!.includes('EXPERT-RESEARCH'));
  assert.ok(!systems[2]!.includes('EXPERT-WRITING'));
  assert.ok(
    systems.every(
      (system) =>
        !system.includes('EXPERT_DEFAULT_SKILL_BODY') &&
        !system.includes('EXPERT_EXPLICIT_SKILL_BODY'),
    ),
  );
  assert.equal(first.events.filter((event) => event.kind === 'session_error').length, 0);
});

test('disabling a bound expert package rejects a fresh send rather than silently running the base role', async (t) => {
  const { session } = makeSession(writingExpert);
  await getSpaceExtensionStore().setEnabled('partner.library', false);
  t.after(() => getSpaceExtensionStore().setEnabled('partner.library', true));

  await assert.rejects(
    () => session.send('This draft must remain editable.'),
    /expert.*unavailable.*disabled/i,
  );
  assert.equal(session.isRunning(), false);
  assert.equal(systems.length, 0);
  assert.deepEqual(session.partnerExpert, writingExpert);
});

test('a queued next turn rechecks the extension after disable and never calls the provider', async (t) => {
  const { session, events } = makeSession(writingExpert);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  beforeResponse = () => gate;
  t.after(() => {
    release();
  });
  t.after(() => getSpaceExtensionStore().setEnabled('partner.library', true));
  await session.send('The first turn may finish with its original expert.');
  await waitFor(() => systems.length === 1);
  const queued = await session.send('Only run when the expert is available.', undefined, {
    queueMode: 'after-turn',
  });
  assert.equal(queued.accepted, true);
  await getSpaceExtensionStore().setEnabled('partner.library', false);
  release();
  await waitFor(() => !session.isRunning());

  assert.equal(systems.length, 1);
  assert.ok(
    events.some(
      (event) => event.kind === 'session_error' && /expert.*unavailable/i.test(event.error),
    ),
  );
});

test('a committed expert change applies to the queued next turn, never the running turn', async (t) => {
  const session = makeHostSession(writingExpert);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  beforeResponse = () => gate;
  t.after(() => {
    release();
  });
  await session.send('First turn.');
  await waitFor(() => systems.length === 1);
  await session.send('Queued next turn.', undefined, { queueMode: 'after-turn' });
  assert.equal(await kodaxHost.setPartnerExpert(session.sessionId, researchExpert), 'ok');
  release();
  await waitFor(() => !session.isRunning());

  assert.equal(systems.length, 2);
  assert.ok(systems[0]!.includes('EXPERT-WRITING'));
  assert.ok(!systems[0]!.includes('EXPERT-RESEARCH'));
  assert.ok(systems[1]!.includes('EXPERT-RESEARCH'));
});

test('a queued turn starting before the expert write ACK uses the old role until a later run', async (t) => {
  const session = makeHostSession(writingExpert);
  await kodaxHost.persistRuntime(session.sessionId);
  let releaseResponse!: () => void;
  let releaseWrite!: () => void;
  let entered!: () => void;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  const writeGate = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  const writeEntered = new Promise<void>((resolve) => {
    entered = resolve;
  });
  class SlowStore extends SessionRuntimeStore {
    override async set(
      ...args: Parameters<InstanceType<typeof SessionRuntimeStore>['set']>
    ): Promise<boolean> {
      entered();
      await writeGate;
      return super.set(...args);
    }
  }
  beforeResponse = () => responseGate;
  t.after(() => {
    releaseResponse();
    releaseWrite();
  });
  await session.send('First turn.');
  await waitFor(() => systems.length === 1);
  await session.send('Queued before expert ACK.', undefined, { queueMode: 'after-turn' });
  setSessionRuntimeStoreForTesting(
    new SlowStore(path.join(profileDirectory, 'space', 'session-runtime')),
  );
  const changing = kodaxHost.setPartnerExpert(session.sessionId, researchExpert);
  await writeEntered;
  releaseResponse();
  await waitFor(() => !session.isRunning());
  assert.equal(systems.length, 2);
  assert.ok(systems.every((system) => system.includes('EXPERT-WRITING')));
  releaseWrite();
  assert.equal(await changing, 'ok');
  await session.send('Sent after expert ACK.');
  await waitFor(() => !session.isRunning());
  assert.ok(systems[2]!.includes('EXPERT-RESEARCH'));
});

test('uninstalling a bound package prevents the next real run without discarding its saved role', async (t) => {
  const { session } = makeSession(writingExpert);
  t.after(async () => {
    await getSpaceExtensionStore().install(path.join(profileDirectory, 'fixture.space-extension'));
    await getSpaceExtensionStore().setEnabled('partner.library', true);
  });
  await getSpaceExtensionStore().uninstall('partner.library');
  await assert.rejects(() => session.send('Use the removed expert.'), /Partner expert unavailable/);
  assert.deepEqual(session.partnerExpert, writingExpert);
  assert.equal(session.isRunning(), false);
  assert.equal(systems.length, 0);
});

test('an expert default Skill reaches the actual SDK model on every turn with that turn’s arguments', async () => {
  const { session } = makeSession(skillExpert);
  assert.deepEqual(await session.send('Review FIRST-DRAFT-TASK.'), {
    accepted: true,
    queued: false,
  });
  await waitFor(() => !session.isRunning());
  assert.deepEqual(await session.send('Review SECOND-DRAFT-TASK.'), {
    accepted: true,
    queued: false,
  });
  await waitFor(() => !session.isRunning());
  assert.equal(systems.length, 2);
  assert.ok(systems.every((system) => system.includes('EXPERT-SKILLED')));
  assert.ok(systems.every((system) => system.includes('EXPERT_DEFAULT_SKILL_BODY')));
  assert.ok(systems[0]!.includes('FIRST-DRAFT-TASK'));
  assert.ok(systems[1]!.includes('SECOND-DRAFT-TASK'));
});

test('an after-turn queued run prepares the same expert Skill with the queued task instead of bypassing it', async (t) => {
  const { session } = makeSession(skillExpert);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  beforeResponse = () => gate;
  t.after(() => release());
  await session.send('FIRST-QUEUED-SKILL-TASK');
  await waitFor(() => systems.length === 1);
  const queued = await session.send('SECOND-QUEUED-SKILL-TASK', undefined, {
    queueMode: 'after-turn',
  });
  assert.equal(queued.accepted && queued.queued, true);
  release();
  await waitFor(() => !session.isRunning());
  assert.equal(systems.length, 2);
  assert.ok(systems[1]!.includes('EXPERT_DEFAULT_SKILL_BODY'));
  assert.ok(systems[1]!.includes('SECOND-QUEUED-SKILL-TASK'));
  assert.ok(!systems[1]!.includes('FIRST-QUEUED-SKILL-TASK'));
});

test('a user-selected slash Skill wins over the expert default without changing the expert role', async () => {
  const { session } = makeSession(skillExpert);
  assert.deepEqual(await session.send('/expert-explicit-fixture EXPLICIT-CHOICE-TASK'), {
    accepted: true,
    queued: false,
  });
  await waitFor(() => !session.isRunning());
  assert.equal(systems.length, 1);
  assert.ok(systems[0]!.includes('EXPERT-SKILLED'));
  assert.ok(systems[0]!.includes('EXPERT_EXPLICIT_SKILL_BODY'));
  assert.ok(systems[0]!.includes('EXPLICIT-CHOICE-TASK'));
  assert.ok(!systems[0]!.includes('EXPERT_DEFAULT_SKILL_BODY'));
  assert.deepEqual(session.partnerExpert, skillExpert);
});

test('prompt-only disables only the expert default and leaves user-selected Skills available', async () => {
  const { session } = makeSession({ ...skillExpert, useSkill: false });
  await session.send('Use only the expert prompt.');
  await waitFor(() => !session.isRunning());
  await session.send('/expert-explicit-fixture User selected this Skill.');
  await waitFor(() => !session.isRunning());
  assert.equal(systems.length, 2);
  assert.ok(systems.every((system) => system.includes('EXPERT-SKILLED')));
  assert.ok(systems.every((system) => !system.includes('EXPERT_DEFAULT_SKILL_BODY')));
  assert.ok(!systems[0]!.includes('EXPERT_EXPLICIT_SKILL_BODY'));
  assert.ok(systems[1]!.includes('EXPERT_EXPLICIT_SKILL_BODY'));
  assert.equal(session.partnerExpert?.useSkill, false);
});

test('a missing default rejects before model admission until the user explicitly chooses prompt-only', async () => {
  const session = makeHostSession(missingSkillExpert);
  await kodaxHost.persistRuntime(session.sessionId);
  assert.deepEqual(await session.send('MISSING-SKILL-TASK'), {
    accepted: false,
    reason: 'skill_not_found',
    queueMode: 'interrupt',
  });
  assert.equal(session.isRunning(), false);
  assert.equal(systems.length, 0);
  const state = await setPartnerExpertForIpc({
    sessionId: session.sessionId,
    expert: {
      extensionId: missingSkillExpert.extensionId,
      expertId: missingSkillExpert.expert.id,
      revision: missingSkillExpert.expert.revision,
      useSkill: false,
    },
  });
  assert.deepEqual(state.expert, { ...missingSkillExpert, useSkill: false });
  assert.deepEqual(await session.send('PROMPT-ONLY-TASK'), { accepted: true, queued: false });
  await waitFor(() => !session.isRunning());
  assert.equal(systems.length, 1);
  assert.ok(systems[0]!.includes('EXPERT-MISSING-SKILL'));
  assert.ok(!systems[0]!.includes('EXPERT_DEFAULT_SKILL_BODY'));
  await assert.rejects(
    () =>
      setPartnerExpertForIpc({
        sessionId: session.sessionId,
        expert: {
          extensionId: missingSkillExpert.extensionId,
          expertId: missingSkillExpert.expert.id,
          revision: missingSkillExpert.expert.revision,
          useSkill: true,
        },
      }),
    /Skill.*unavailable/,
  );
  assert.equal(session.partnerExpert?.useSkill, false);
});

test('an unavailable default Skill cannot fall through on an internally started queued turn', async (t) => {
  const { session, events } = makeSession(writingExpert);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  beforeResponse = () => gate;
  t.after(() => release());
  await session.send('Current task.');
  await waitFor(() => systems.length === 1);
  await session.send('QUEUED-MISSING-SKILL-TASK', undefined, { queueMode: 'after-turn' });
  // Models a restored binding whose external Skill was removed before the next turn.
  session.partnerExpert = structuredClone(missingSkillExpert);
  release();
  await waitFor(() => !session.isRunning());
  assert.equal(systems.length, 1);
  assert.ok(
    events.some(
      (event) => event.kind === 'session_error' && event.error.includes('skill_not_found'),
    ),
  );
  assert.deepEqual(session.partnerExpert, missingSkillExpert);
});

for (const { kind, reason } of [
  { kind: 'hook', reason: 'skill_blocked' },
  { kind: 'fork', reason: 'skill_fork_unsupported' },
]) {
  test(`an expert's ${kind} Skill cannot bypass Partner's existing execution boundary`, async () => {
    const expert = restrictedExperts.get(kind);
    assert.ok(expert);
    const { session } = makeSession(expert, boundaryProjectRoot);
    assert.deepEqual(await session.send('Check the boundary.'), {
      accepted: false,
      reason,
      queueMode: 'interrupt',
    });
    assert.equal(session.isRunning(), false);
    assert.equal(systems.length, 0);
    await assert.rejects(fs.access(path.join(boundaryProjectRoot, `${kind}-must-not-run`)), {
      code: 'ENOENT',
    });
    assert.deepEqual(session.partnerExpert, expert);
  });
}

test('expert Skill dynamic context retains the SDK disabled placeholder and never runs its shell command', async () => {
  const expert = restrictedExperts.get('dynamic');
  assert.ok(expert);
  const { session } = makeSession(expert, boundaryProjectRoot);
  // The shared SDK resolves a disabled command to an error placeholder rather than
  // rejecting the whole Skill. Preserve that existing behavior, without shell authority.
  assert.deepEqual(await session.send('Check dynamic context.'), { accepted: true, queued: false });
  await waitFor(() => !session.isRunning());
  assert.equal(systems.length, 1);
  assert.ok(systems[0]!.includes('Dynamic context disabled by host'));
  await assert.rejects(fs.access(path.join(boundaryProjectRoot, 'dynamic-must-not-run')), {
    code: 'ENOENT',
  });
});
