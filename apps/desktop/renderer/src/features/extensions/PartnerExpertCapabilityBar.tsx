import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.js';
import { usePartnerExpert } from './PartnerExpertProvider.js';
import {
  projectPartnerExpertCapabilityGuide,
  type PartnerExpertCapabilityGroup,
  type PartnerExpertCapabilitySelection,
} from './partnerExpertCapabilityGuide.js';

export interface PartnerExpertCapabilityBarProps {
  readonly onInsertDraft: (text: string) => void;
}

function capabilityScopeKey(
  projectRoot: string | null,
  sessionId: string | null,
  extensionId: string,
  extensionVersion: string,
  expertId: string,
  expertRevision: number,
): string {
  return JSON.stringify([
    projectRoot,
    sessionId,
    extensionId,
    extensionVersion,
    expertId,
    expertRevision,
  ]);
}

interface CapabilityChoicesProps {
  readonly groups: readonly PartnerExpertCapabilityGroup[];
  readonly selectedGroup: PartnerExpertCapabilityGroup | null;
  readonly disabled: boolean;
  readonly scopeKey: string;
  readonly onSelect: (selection: PartnerExpertCapabilitySelection | null) => void;
  readonly onInsertDraft: (text: string) => void;
}

function CapabilityGroups({
  groups,
  disabled,
  scopeKey,
  onSelect,
}: Pick<CapabilityChoicesProps, 'groups' | 'disabled' | 'scopeKey' | 'onSelect'>): JSX.Element {
  return (
    <>
      {groups.map((group) => (
        <button
          key={group.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect({ scopeKey, groupId: group.id })}
          title={group.description}
          className="inline-flex min-h-8 items-center rounded-lg border border-border-default bg-surface px-3 py-1.5 text-xs text-fg-primary hover:border-accent/40 hover:bg-hover-bg disabled:opacity-50"
        >
          {group.label}
        </button>
      ))}
    </>
  );
}

function CapabilityActions({
  selectedGroup,
  disabled,
  onSelect,
  onInsertDraft,
}: Pick<CapabilityChoicesProps, 'disabled' | 'onSelect' | 'onInsertDraft'> & {
  readonly selectedGroup: PartnerExpertCapabilityGroup;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelect(null)}
        aria-label={t('extensions.expertCapabilityBack')}
        className="inline-flex h-8 items-center gap-1 rounded-lg border border-border-default bg-surface px-2 text-xs text-fg-secondary hover:bg-hover-bg disabled:opacity-50"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        <span>{selectedGroup.label}</span>
      </button>
      {selectedGroup.actions.map((action) => (
        <button
          key={action.id}
          type="button"
          disabled={disabled}
          onClick={() => onInsertDraft(action.promptTemplate)}
          title={action.description}
          className="inline-flex min-h-8 items-center rounded-lg border border-border-default bg-surface px-3 py-1.5 text-xs text-fg-primary hover:border-accent/40 hover:bg-hover-bg disabled:opacity-50"
        >
          {action.label}
        </button>
      ))}
    </>
  );
}

function CapabilityChoices({
  groups,
  selectedGroup,
  disabled,
  scopeKey,
  onSelect,
  onInsertDraft,
}: CapabilityChoicesProps): JSX.Element {
  if (!selectedGroup) {
    return (
      <CapabilityGroups
        groups={groups}
        disabled={disabled}
        scopeKey={scopeKey}
        onSelect={onSelect}
      />
    );
  }
  return (
    <CapabilityActions
      selectedGroup={selectedGroup}
      disabled={disabled}
      onSelect={onSelect}
      onInsertDraft={onInsertDraft}
    />
  );
}

export function PartnerExpertCapabilityBar({
  onInsertDraft,
}: PartnerExpertCapabilityBarProps): JSX.Element | null {
  const context = usePartnerExpert();
  const { t } = useI18n();
  const [selection, setSelection] = useState<PartnerExpertCapabilitySelection | null>(null);

  if (!context || context.snapshot.context.surface !== 'partner') return null;
  const { snapshot } = context;
  const expert = snapshot.state.expert;
  if (!expert) return null;

  const scopeKey = capabilityScopeKey(
    snapshot.context.projectRoot,
    snapshot.context.sessionId,
    expert.extensionId,
    expert.extensionVersion,
    expert.expert.id,
    expert.expert.revision,
  );
  const projection = projectPartnerExpertCapabilityGuide(expert.expert, scopeKey, selection);
  if (!projection) return null;

  const disabled = snapshot.loading || snapshot.changing || !snapshot.state.available;
  return (
    <div
      data-testid="partner-expert-capability-bar"
      role="group"
      aria-label={t('extensions.expertCapabilities')}
      className="flex min-w-0 flex-wrap items-center gap-1.5"
    >
      <CapabilityChoices
        groups={projection.groups}
        selectedGroup={projection.selectedGroup}
        disabled={disabled}
        scopeKey={scopeKey}
        onSelect={setSelection}
        onInsertDraft={onInsertDraft}
      />
    </div>
  );
}
