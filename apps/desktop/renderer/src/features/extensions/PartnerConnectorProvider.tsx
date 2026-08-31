import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { SpaceConnectorDefinitionT } from '@kodax-space/space-ipc-schema';
import { useAppStore } from '../../store/appStore.js';
import { useSurfaceStore } from '../../store/surface.js';
import { NEW_CONVERSATION_EVENT } from '../../store/newConversation.js';
import { invokeExtensionHost, useSpaceExtensions } from './SpaceExtensionsProvider.js';
import {
  createPartnerConnectorBinding,
  type PartnerConnectorBinding,
} from './partnerConnectorBinding.js';
import { expertContextMatches } from './partnerExpertBinding.js';
import type { ExtensionViewContext } from './extensionViewPolicy.js';

const Context = createContext<{
  binding: PartnerConnectorBinding;
  snapshot: ReturnType<PartnerConnectorBinding['getSnapshot']>;
} | null>(null);
export const PARTNER_CONNECTOR_DETAIL_EVENT = 'kodax-space.partner-connector-detail';
export interface PartnerConnectorDetailRequest {
  readonly context: ExtensionViewContext;
  readonly extensionId: string;
  readonly connector: SpaceConnectorDefinitionT;
}
export function requestPartnerConnectorDetail(detail: PartnerConnectorDetailRequest): void {
  window.dispatchEvent(new CustomEvent(PARTNER_CONNECTOR_DETAIL_EVENT, { detail }));
}
export function PartnerConnectorProvider({
  children,
}: {
  readonly children: ReactNode;
}): JSX.Element {
  const surface = useSurfaceStore((state) => state.currentSurface);
  const projectRoot = useAppStore((state) => state.currentProjectPath);
  const sessionId = useAppStore((state) => state.currentSessionId);
  const { snapshot: extensions } = useSpaceExtensions();
  const [binding] = useState(() =>
    createPartnerConnectorBinding({
      resolve: (root, connectors) =>
        invokeExtensionHost('partner.connectors.resolve', { projectRoot: root, connectors }),
      get: (id) => invokeExtensionHost('session.partnerConnectors.get', { sessionId: id }),
      set: (id, connectors) =>
        invokeExtensionHost('session.partnerConnectors.set', { sessionId: id, connectors }),
    }),
  );
  const stored = useSyncExternalStore(binding.subscribe, binding.getSnapshot, binding.getSnapshot);
  useEffect(() => {
    void binding.setContext({ surface, projectRoot, sessionId });
  }, [binding, surface, projectRoot, sessionId]);
  useEffect(() => {
    const clear = (): void => binding.clearDraft();
    window.addEventListener(NEW_CONVERSATION_EVENT, clear);
    return () => window.removeEventListener(NEW_CONVERSATION_EVENT, clear);
  }, [binding]);
  useEffect(() => {
    const changed = window.kodaxSpace?.on(
      'session.partnerConnectors.changed',
      ({ sessionId: id, state }) => binding.receive(id, state),
    );
    const refreshed = window.kodaxSpace?.on(
      'partner.connectors.changed',
      () => void binding.refresh(),
    );
    return () => {
      changed?.();
      refreshed?.();
    };
  }, [binding]);
  useEffect(() => {
    void binding.refresh();
  }, [binding, extensions.extensions]);
  const context = { surface, projectRoot, sessionId };
  const snapshot = expertContextMatches(stored.context, context)
    ? stored
    : {
        ...stored,
        context,
        state: { connectors: [] },
        loading: surface === 'partner',
        changing: false,
        error: null,
      };
  const state = {
    connectors: snapshot.state.connectors.map((item) =>
      !extensions.loading &&
      !extensions.extensions.some(
        (extension) => extension.id === item.binding.extensionId && extension.enabled,
      )
        ? { ...item, available: false, unavailableReason: 'Extension disabled or uninstalled' }
        : item,
    ),
  };
  return (
    <Context.Provider value={{ binding, snapshot: { ...snapshot, state } }}>
      {children}
    </Context.Provider>
  );
}
export const usePartnerConnectors = () => useContext(Context);
