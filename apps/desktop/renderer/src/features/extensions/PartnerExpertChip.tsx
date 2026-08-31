import { Sparkles, X } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.js';
import { requestPartnerExpertDetail, usePartnerExpert } from './PartnerExpertProvider.js';

export function PartnerExpertChip({ running }: { readonly running: boolean }): JSX.Element | null {
  const context = usePartnerExpert();
  const { t } = useI18n();
  if (!context || context.snapshot.context.surface !== 'partner') return null;
  const { snapshot, binding } = context;
  const expert = snapshot.state.expert;
  if (!expert && !snapshot.error && !snapshot.changing) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 px-0.5" data-testid="partner-expert-binding">
      {expert && (
        <div
          className={`inline-flex max-w-full items-center rounded-md border text-xs ${snapshot.state.available ? 'border-border-default bg-surface' : 'border-danger/40 bg-danger/5'}`}
        >
          <button
            type="button"
            data-testid="partner-expert-chip"
            onClick={() => requestPartnerExpertDetail(expert, snapshot.context)}
            className="inline-flex min-w-0 items-center gap-1.5 px-2 py-1 text-fg-secondary"
            title={t('extensions.expertDetails')}
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent-ink" aria-hidden />
            <span className="truncate">{expert.expert.name}</span>
            {!snapshot.state.available && (
              <span className="shrink-0 text-[10px] text-danger">
                {t('extensions.expertUnavailable')}
              </span>
            )}
          </button>
          <button
            type="button"
            data-testid="partner-expert-remove"
            disabled={snapshot.changing}
            onClick={() =>
              void binding.remove().catch(() => {
                // The binding controller keeps the previous expert and exposes this error below.
              })
            }
            title={t('extensions.removeExpert')}
            aria-label={t('extensions.removeExpert')}
            className="mr-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-fg-muted hover:bg-hover-bg disabled:opacity-50"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </div>
      )}
      {(running || snapshot.changing) && (
        <span className="text-[10px] text-fg-muted" role="status">
          {t(snapshot.changing ? 'extensions.expertSaving' : 'extensions.expertNextTurn')}
        </span>
      )}
      {(snapshot.error || !snapshot.state.available) && (
        <span role="alert" className="text-[11px] text-danger">
          {snapshot.error ?? snapshot.state.unavailableReason}
        </span>
      )}
      {snapshot.error && (
        <button
          type="button"
          onClick={() => void binding.refresh()}
          disabled={snapshot.loading || snapshot.changing}
          className="text-[11px] text-fg-muted underline disabled:opacity-50"
        >
          {t('common.refresh')}
        </button>
      )}
    </div>
  );
}
