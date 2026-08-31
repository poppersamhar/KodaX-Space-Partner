import { Link2, X } from 'lucide-react';
import { usePartnerConnectors, requestPartnerConnectorDetail } from './PartnerConnectorProvider.js';
import { useI18n } from '../../i18n/I18nProvider.js';

export function PartnerConnectorChips(): JSX.Element | null {
  const context = usePartnerConnectors();
  const { t } = useI18n();
  if (!context?.snapshot.state.connectors.length) return null;
  return (
    <div className="flex flex-wrap gap-2" data-testid="partner-connector-chips">
      {context.snapshot.state.connectors.map(({ binding, available, unavailableReason }) => (
        <div
          key={binding.connectionId}
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${available ? 'border-border-default' : 'border-danger text-danger'}`}
        >
          <button
            type="button"
            title={unavailableReason ?? binding.accountLabel}
            onClick={() =>
              requestPartnerConnectorDetail({
                context: context.snapshot.context,
                extensionId: binding.extensionId,
                connector: {
                  id: binding.connectorId,
                  adapter: 'feishu-cli',
                  name: binding.name,
                  description: '',
                },
              })
            }
            className="inline-flex items-center gap-1"
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden />
            {binding.name} · {binding.documents.length}
            {!available && ` · ${t('connectors.unavailable')}`}
          </button>
          <button
            type="button"
            aria-label={t('connectors.remove')}
            disabled={context.snapshot.changing || context.snapshot.loading}
            onClick={() => {
              void context.binding.remove(binding.connectionId).catch(() => undefined);
            }}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ))}
      {context.snapshot.error && (
        <p role="alert" className="w-full text-xs text-danger">
          {context.snapshot.error}
        </p>
      )}
    </div>
  );
}
