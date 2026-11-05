import { useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import { getStatus, getStatusHistory } from '../../api/status';
import type { StatusSample } from '../../types';

const REFRESH_MS = 15_000;
/** Samples kept when the page samples by itself: an hour. */
const LOCAL_SAMPLES = 240;

export interface StatusHistory {
  samples: StatusSample[];
  /** `server`: the admin plugin's history; `local`: sampled by this page since it opened (older servers). */
  source: 'server' | 'local';
}

/**
 * The server's status over the last `minutes`, refreshed every 15 seconds. Servers without a history (before
 * 1.0.0-beta.19) are sampled by the page while it is open.
 */
export function useStatusHistory(minutes: number): StatusHistory | null {
  const [history, setHistory] = useState<StatusHistory | null>(null);
  const [local, setLocal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!local) {
        try {
          const response = await getStatusHistory(minutes);
          if (cancelled) return;
          // Anything but a history (an older server's fallback page, a proxy) means the page samples by itself
          if (Array.isArray(response?.samples)) setHistory({ samples: response.samples, source: 'server' });
          else setLocal(true);
        } catch (err) {
          if (!cancelled && err instanceof ApiError && (err.status === 404 || err.status === 501)) setLocal(true);
        }
        return;
      }
      try {
        const status = await getStatus();
        if (cancelled) return;
        const sample: StatusSample = {
          timestamp: new Date().toISOString(),
          memoryMb: status.memoryUsageMb,
          cpuPercent: status.cpuUsagePercent ?? null,
          activeWsConnections: status.activeWsConnections,
          activeShellSessions: status.activeShellSessions,
        };
        setHistory(prev => ({
          source: 'local',
          samples: [...(prev?.source === 'local' ? prev.samples : []), sample].slice(-LOCAL_SAMPLES),
        }));
      } catch {
        // The next tick tries again
      }
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [minutes, local]);

  return history;
}
