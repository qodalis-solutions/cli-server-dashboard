import { useWebSocket } from '../context/WebSocketContext';
import { useLiveReloadFrom, type LiveReloadOptions } from '@qodalis/cli-server-dashboard-kit';

export { LIVE_RELOAD_DELAY, JOB_STATE_RELOAD_DELAY, matchesEventPattern } from '@qodalis/cli-server-dashboard-kit';
export type { ServerEvent, LiveReloadOptions } from '@qodalis/cli-server-dashboard-kit';

/** {@link useLiveReloadFrom} on the dashboard's events socket. */
export function useLiveReload(patterns: string | readonly string[], reload: () => void, options: LiveReloadOptions = {}) {
  const { subscribe } = useWebSocket();
  useLiveReloadFrom(subscribe, patterns, reload, options);
}
