import { useEffect, useRef, useState } from 'react';
import { Link2, Settings2 } from 'lucide-react';
import type {
  PartnerConnectorConnectionT,
  SpaceConnectorDefinitionT,
} from '@kodax-space/space-ipc-schema';
import {
  usePartnerConnectors,
  requestPartnerConnectorDetail,
  requestPartnerConnectorDialog,
  requestPartnerConnectorManagement,
} from './PartnerConnectorProvider.js';
import { useI18n } from '../../i18n/I18nProvider.js';
import { FloatingSurfaceHost } from '../../shell/FloatingSurfaceHost.js';
import type { FloatingSurfaceDescriptor } from '../../shell/floatingSurfacePolicy.js';
import { PartnerConnectorIcon } from './PartnerConnectorIcon.js';

const popoverSurface: FloatingSurfaceDescriptor = {
  id: 'partner-connectors',
  kind: 'anchored_menu',
  owner: 'environment_hub',
  placement: 'trigger_anchored',
  modality: 'none',
  canAutoOpen: false,
  dismiss: 'outside_or_escape',
  focus: 'move_to_surface',
  label: 'Conversation connectors',
};

/** One discoverable control; account connection and per-conversation enablement remain separate. */
export function PartnerConnectorChips(): JSX.Element | null {
  const context = usePartnerConnectors();
  const { t } = useI18n();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const scopeKey = JSON.stringify(context?.snapshot.context);
  useEffect(() => {
    setAnchor(null);
    setError(null);
  }, [scopeKey]);
  useEffect(() => {
    if (!anchor) return;
    const closeOnOutside = (event: MouseEvent): void => {
      if (
        event.target instanceof Node &&
        !panel.current?.contains(event.target) &&
        !trigger.current?.contains(event.target)
      )
        setAnchor(null);
    };
    const closeOnMove = (): void => setAnchor(null);
    document.addEventListener('mousedown', closeOnOutside);
    window.addEventListener('resize', closeOnMove);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      window.removeEventListener('resize', closeOnMove);
    };
  }, [anchor]);
  if (!context || context.snapshot.context.surface !== 'partner') return null;
  const { snapshot, connectorCatalog } = context;
  const selected = snapshot.state.connectors;
  const rows: {
    extensionId: string;
    connector: SpaceConnectorDefinitionT;
    connection: PartnerConnectorConnectionT;
  }[] = connectorCatalog.entries.flatMap((entry) =>
    entry.connections
      .filter((connection) => connection.connected)
      .map((connection) => ({
        extensionId: entry.extensionId,
        connector: entry.connector,
        connection,
      })),
  );
  for (const item of selected) {
    if (rows.some((row) => row.connection.id === item.binding.connectionId)) continue;
    rows.push({
      extensionId: item.binding.extensionId,
      connector: {
        id: item.binding.connectorId,
        adapter: 'feishu-cli',
        name: item.binding.name,
        description: '',
      },
      connection: {
        id: item.binding.connectionId,
        extensionId: item.binding.extensionId,
        connectorId: item.binding.connectorId,
        revision: item.binding.connectionRevision,
        profile: 'unavailable',
        accountLabel: item.binding.accountLabel,
        connected: false,
        permissions: { read: false, create: false, append: false },
      },
    });
  }
  const toggle = async (connection: PartnerConnectorConnectionT): Promise<void> => {
    setError(null);
    try {
      if (selected.some((item) => item.binding.connectionId === connection.id))
        await context.binding.remove(connection.id);
      else
        await context.binding.select({
          extensionId: connection.extensionId,
          connectorId: connection.connectorId,
          connectionId: connection.id,
          connectionRevision: connection.revision,
          documents: [],
        });
    } catch (reason) {
      if (JSON.stringify(context.binding.getSnapshot().context) === scopeKey)
        setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  const busy = snapshot.loading || snapshot.changing;
  return (
    <div data-testid="partner-connector-chips" className="inline-flex items-center">
      <button
        ref={trigger}
        type="button"
        aria-label={t('connectors.composer')}
        title={t('connectors.composer')}
        aria-haspopup="dialog"
        aria-expanded={!!anchor}
        onClick={() =>
          setAnchor((current) =>
            current ? null : (trigger.current?.getBoundingClientRect() ?? null),
          )
        }
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2 text-xs hover:bg-hover-bg ${selected.some((item) => !item.available) ? 'border-danger text-danger' : selected.length ? 'border-accent/30 bg-accent/10 text-accent-ink' : 'border-border-default text-fg-muted'}`}
      >
        <Link2 className="h-4 w-4" aria-hidden />
        {selected.length > 0 && <span>{selected.length}</span>}
      </button>
      {anchor && (
        <FloatingSurfaceHost
          surface={popoverSurface}
          role="dialog"
          ariaLabel={t('connectors.composer')}
          onClose={() => setAnchor(null)}
          testId="partner-connector-popover"
        >
          <div
            ref={panel}
            className="pointer-events-auto fixed w-80 max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl border border-border-default bg-surface p-3 text-fg-primary shadow-2xl"
            style={{
              left: Math.max(12, Math.min(anchor.left, window.innerWidth - 332)),
              ...(anchor.top > 240
                ? { bottom: window.innerHeight - anchor.top + 8 }
                : { top: anchor.bottom + 8 }),
              maxHeight:
                anchor.top > 240
                  ? Math.min(420, anchor.top - 20)
                  : Math.max(160, window.innerHeight - anchor.bottom - 24),
            }}
          >
            <div className="mb-3 flex items-center justify-between gap-3 text-xs">
              <span className="font-medium">{t('connectors.composer')}</span>
              <span className="text-fg-muted">
                {t('connectors.enabledCount', { count: selected.length })}
              </span>
            </div>
            {rows.map(({ extensionId, connector, connection }) => {
              const item = selected.find((entry) => entry.binding.connectionId === connection.id);
              const unavailable = !!item && (!item.available || !connection.connected);
              return (
                <div
                  key={connection.id}
                  className="border-b border-border-default/60 py-3 last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <PartnerConnectorIcon
                      adapter={connector.adapter}
                      className="h-5 w-5 shrink-0 text-accent-ink"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{connector.name}</p>
                      <p
                        className={`truncate text-xs ${unavailable ? 'text-danger' : 'text-fg-muted'}`}
                        title={item?.unavailableReason}
                      >
                        {connection.accountLabel}
                        {unavailable ? ` · ${t('connectors.unavailable')}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-label={t('connectors.sessionSwitch', { name: connection.accountLabel })}
                      aria-checked={!!item}
                      disabled={
                        busy || (!item && (!connection.connected || !snapshot.context.projectRoot))
                      }
                      onClick={() => void toggle(connection)}
                      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${item ? 'bg-accent' : 'bg-fg-muted/35'}`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${item ? 'left-[18px]' : 'left-0.5'}`}
                      />
                    </button>
                  </div>
                  <div className="ml-8 mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      className="text-xs text-fg-muted hover:text-fg-primary"
                      onClick={() => {
                        setAnchor(null);
                        requestPartnerConnectorDetail({
                          context: snapshot.context,
                          extensionId,
                          connector,
                          connectionId: connection.id,
                        });
                      }}
                    >
                      {t('connectors.documentScope')}
                    </button>
                    {item && !item.binding.documents.length && (
                      <span className="text-[10px] text-fg-muted">
                        {t('connectors.emptyScope')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {connectorCatalog.entries
              .filter((entry) => !entry.connections.some((connection) => connection.connected))
              .map((entry) => (
                <div
                  key={`${entry.extensionId}:${entry.connector.id}`}
                  className="flex items-center gap-3 py-3"
                >
                  <PartnerConnectorIcon
                    adapter={entry.connector.adapter}
                    className="h-5 w-5 shrink-0 text-accent-ink"
                  />
                  <span className="flex-1 text-sm">{entry.connector.name}</span>
                  <button
                    type="button"
                    className="rounded-md border border-border-default px-2 py-1 text-xs hover:bg-hover-bg"
                    onClick={() => {
                      setAnchor(null);
                      requestPartnerConnectorDialog({
                        context: snapshot.context,
                        extensionId: entry.extensionId,
                        connector: entry.connector,
                      });
                    }}
                  >
                    {t('connectors.connect')}
                  </button>
                </div>
              ))}
            {connectorCatalog.loading && (
              <p role="status" className="py-2 text-xs text-fg-muted">
                {t('common.loading')}
              </p>
            )}
            {!connectorCatalog.loading && !connectorCatalog.entries.length && !rows.length && (
              <p className="py-2 text-xs leading-5 text-fg-muted">{t('connectors.emptyCatalog')}</p>
            )}
            {(error || snapshot.error || connectorCatalog.error) && (
              <p role="alert" className="py-2 text-xs text-danger">
                {error || snapshot.error || connectorCatalog.error}
              </p>
            )}
            <button
              type="button"
              className="mt-2 flex w-full items-center gap-2 rounded-lg border-t border-border-default px-2 py-3 text-left text-xs hover:bg-hover-bg"
              onClick={() => {
                setAnchor(null);
                requestPartnerConnectorManagement(
                  snapshot.context,
                  connectorCatalog.entries[0]?.extensionId,
                );
              }}
            >
              <Settings2 className="h-4 w-4" aria-hidden />
              {t('connectors.manage')}
            </button>
          </div>
        </FloatingSurfaceHost>
      )}
    </div>
  );
}
