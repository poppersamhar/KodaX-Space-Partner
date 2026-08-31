import { useCallback, useEffect, useRef, useState } from 'react';
import type { PartnerRemoteRecordsT } from '@kodax-space/space-ipc-schema';
import { useAppStore } from '../../store/appStore.js';
import { useSurfaceStore } from '../../store/surface.js';
import { invokeExtensionHost } from './SpaceExtensionsProvider.js';

const empty: PartnerRemoteRecordsT = { sources: [], proposals: [], receipts: [] };
/** The records endpoint serves historical snapshots; loading never calls Feishu. */
export function usePartnerRemoteRecords() {
  const projectRoot = useAppStore((state) => state.currentProjectPath);
  const sessionId = useAppStore((state) => state.currentSessionId);
  const surface = useSurfaceStore((state) => state.currentSurface);
  const [records, setRecords] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const revision = useRef(0);
  const refresh = useCallback(async (): Promise<void> => {
    const captured = ++revision.current;
    if (!projectRoot || !sessionId || surface !== 'partner') {
      setRecords(empty);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await invokeExtensionHost('partner.connectors.records', {
        projectRoot,
        sessionId,
      });
      if (captured === revision.current) {
        setRecords(next);
        setError(null);
      }
    } catch (reason) {
      if (captured === revision.current)
        setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (captured === revision.current) setLoading(false);
    }
  }, [projectRoot, sessionId, surface]);
  useEffect(() => {
    setRecords(empty);
    void refresh();
    return () => {
      revision.current += 1;
    };
  }, [refresh]);
  useEffect(
    () =>
      window.kodaxSpace?.on('partner.connectors.changed', (event) => {
        if (
          (!event.sessionId || event.sessionId === sessionId) &&
          (!event.projectRoot || event.projectRoot === projectRoot)
        )
          void refresh();
      }),
    [projectRoot, sessionId, refresh],
  );
  return { records, error, loading, refresh };
}
