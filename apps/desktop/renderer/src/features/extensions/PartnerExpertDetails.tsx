import { useState } from 'react';
import type { PartnerExpertSnapshotT } from '@kodax-space/space-ipc-schema';
import { useI18n } from '../../i18n/I18nProvider.js';
import { useSpaceExtensions } from './SpaceExtensionsProvider.js';
import { usePartnerExpert } from './PartnerExpertProvider.js';
import { expertRef } from './partnerExpertBinding.js';

export function projectPartnerExpertDetails(
  target: PartnerExpertSnapshotT,
  selected: PartnerExpertSnapshotT | null,
) {
  const isCurrent =
    selected !== null &&
    selected.extensionId === target.extensionId &&
    selected.extensionVersion === target.extensionVersion &&
    selected.expert.id === target.expert.id &&
    selected.expert.revision === target.expert.revision;
  return { expert: isCurrent ? selected : target, isCurrent };
}

export function PartnerExpertDetails({
  expert,
}: {
  readonly expert: PartnerExpertSnapshotT;
}): JSX.Element {
  const { t } = useI18n();
  const { snapshot } = useSpaceExtensions();
  const binding = usePartnerExpert();
  const view = projectPartnerExpertDetails(expert, binding?.snapshot.state.expert ?? null);
  const enabled = snapshot.extensions.some(
    (entry) => entry.id === expert.extensionId && entry.enabled,
  );
  const key = `${expert.extensionId}:${expert.extensionVersion}:${expert.expert.id}:${expert.expert.revision}`;
  const [feedback, setFeedback] = useState<{
    key: string;
    error?: string;
    message?: string;
  } | null>(null);
  const changeSkillMode = async (useSkill: boolean): Promise<void> => {
    if (!binding || !view.isCurrent) return;
    try {
      await binding.binding.select({ ...expertRef(view.expert), useSkill });
      setFeedback(null);
    } catch (error) {
      setFeedback({ key, error: error instanceof Error ? error.message : String(error) });
    }
  };
  const copyTask = async (text: string): Promise<void> => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error(t('extensions.expertCopyFailed'));
      await navigator.clipboard.writeText(text);
      setFeedback({ key, message: t('extensions.expertTaskCopied') });
    } catch {
      setFeedback({ key, error: t('extensions.expertCopyFailed') });
    }
  };
  const currentError = view.isCurrent
    ? (binding?.snapshot.error ?? binding?.snapshot.state.unavailableReason)
    : null;
  return (
    <PartnerExpertDetailsContent
      {...view}
      enabled={snapshot.loading || enabled}
      busy={binding?.snapshot.changing === true || binding?.snapshot.loading === true}
      error={(feedback?.key === key ? feedback.error : null) ?? currentError}
      message={feedback?.key === key ? feedback.message : null}
      onUseSkillChange={(useSkill) => void changeSkillMode(useSkill)}
      onCopyTask={(text) => void copyTask(text)}
    />
  );
}

export function PartnerExpertDetailsContent({
  expert,
  isCurrent,
  enabled,
  busy,
  error,
  message,
  onUseSkillChange,
  onCopyTask,
}: {
  readonly expert: PartnerExpertSnapshotT;
  readonly isCurrent: boolean;
  readonly enabled: boolean;
  readonly busy: boolean;
  readonly error?: string | null;
  readonly message?: string | null;
  readonly onUseSkillChange: (useSkill: boolean) => void;
  readonly onCopyTask: (text: string) => void;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="h-full space-y-5 overflow-y-auto p-4" data-testid="partner-expert-details">
      <div>
        <h2 className="text-base font-medium">{expert.expert.name}</h2>
        <p className="mt-2 text-xs leading-5 text-fg-muted">{expert.expert.description}</p>
      </div>
      {!enabled && (
        <p role="status" className="text-xs text-danger">
          {t('extensions.expertPackageUnavailable')}
        </p>
      )}
      <dl className="space-y-2 text-xs">
        <div>
          <dt className="text-fg-muted">{t('extensions.expertSource')}</dt>
          <dd className="mt-1 break-all">
            {expert.extensionId} · v{expert.extensionVersion} · r{expert.expert.revision}
          </dd>
        </div>
      </dl>
      <p className="text-[11px] leading-5 text-fg-muted">{t('extensions.expertVersionNote')}</p>
      {expert.expert.skillRef ? (
        <section className="space-y-2 rounded-lg border border-border-default p-3">
          <p className="text-xs text-fg-secondary">
            {t('extensions.expertSkill', { name: expert.expert.skillRef })}
          </p>
          {isCurrent && (
            <label className="flex items-center gap-2 text-xs text-fg-secondary">
              <input
                type="checkbox"
                data-testid="expert-skill-toggle"
                checked={expert.useSkill !== false}
                disabled={busy || !enabled}
                onChange={(event) => onUseSkillChange(event.currentTarget.checked)}
              />
              {t('extensions.useConfiguredSkill')}
            </label>
          )}
          {expert.useSkill === false && (
            <p className="text-[11px] leading-5 text-fg-muted">
              {t('extensions.expertSkillDisabled')}
            </p>
          )}
          {isCurrent && (
            <p className="text-[11px] leading-5 text-fg-muted">
              {t('extensions.expertSkillNextTurn')}
            </p>
          )}
        </section>
      ) : (
        <p className="text-[11px] leading-5 text-fg-muted">{t('extensions.expertPromptOnly')}</p>
      )}
      {error && (
        <p role="alert" className="break-words text-xs text-danger">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-xs text-fg-muted">
          {message}
        </p>
      )}
      <section>
        <h3 className="mb-2 text-xs font-medium">{t('extensions.expertPrompt')}</h3>
        <pre className="whitespace-pre-wrap break-words rounded-lg border border-border-default bg-surface-2 p-3 font-sans text-xs leading-6 text-fg-secondary">
          {expert.expert.prompt}
        </pre>
      </section>
      {expert.expert.starterTasks.length > 0 && (
        <section>
          <h3 className="text-xs font-medium">{t('extensions.expertStarterTasks')}</h3>
          <p className="my-2 text-[11px] leading-5 text-fg-muted">
            {t('extensions.expertStarterTasksHint')}
          </p>
          <ol className="space-y-2">
            {expert.expert.starterTasks.map((task, index) => (
              <li key={index} className="rounded-lg border border-border-default p-3">
                <p className="whitespace-pre-wrap break-words text-xs leading-5">{task}</p>
                <button
                  type="button"
                  data-testid="expert-copy-starter-task"
                  className="mt-2 text-[11px] text-fg-muted underline hover:text-fg-primary"
                  onClick={() => onCopyTask(task)}
                >
                  {t('extensions.expertCopyStarterTask', { index: index + 1 })}
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
