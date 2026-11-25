import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import { Spinner } from '@qodalis/cli-server-dashboard-kit';
import { ApiError } from '../api/client';
import {
  getRestartStatus,
  pendingOf,
  pendingSignature,
  restartServer,
  serverResponds,
  RESTART_PERMISSION,
  RESTART_REQUIRED_EVENT,
  RESTARTING_EVENT,
  SERVICE_RESTART_CLOSE_CODE,
} from '../api/restart';
import type { PendingRestartItem, RestartStatus } from '../types';
import { useI18n } from '../i18n';
import { useExtensions } from './ExtensionsContext';
import { useOptionalWebSocket } from './WebSocketContext';

/** How often the overlay asks whether the server is back. */
export const RESTART_POLL_MS = 1000;
/** How long the overlay waits before saying the server has not come back. */
export const RESTART_TIMEOUT_MS = 120_000;
/** How long the "Server restarted" toast stays. */
export const RESTART_TOAST_MS = 5000;
/** This tab's dismissed banner: the pending list it was dismissed for (sessionStorage). */
export const RESTART_DISMISSED_KEY = 'qcli_admin_restart_dismissed';

type Phase = 'idle' | 'restarting' | 'timeout';

interface RestartState {
  /** Null until loaded, on servers without restarts and for users without admin:access. */
  status: RestartStatus | null;
  pending: PendingRestartItem[];
  /** The user holds `server:restart`. */
  permitted: boolean;
  /** The server can restart itself and the user may ask it to. */
  canRestart: boolean;
  /** A change with this id (`config:<provider>.<section>.<key>`) waits for a restart. */
  isPending: (id: string) => boolean;
  /** Opens the confirmation (only when {@link canRestart}). */
  requestRestart: () => void;
  /** The banner was dismissed for the current pending list (this tab). */
  dismissed: boolean;
  dismiss: () => void;
  /** Grows each time the server came back: the layout shows the page again so it loads its data anew. */
  generation: number;
}

const NONE: RestartState = {
  status: null,
  pending: [],
  permitted: false,
  canRestart: false,
  isPending: () => false,
  requestRestart: () => {},
  dismissed: false,
  dismiss: () => {},
  generation: 0,
};

const RestartContext = createContext<RestartState | null>(null);

/** The restart state; outside a {@link RestartProvider} (single components in tests): nothing pending, no restart. */
export function useRestart(): RestartState {
  return useContext(RestartContext) ?? NONE;
}

function readDismissed(): string | null {
  try {
    return sessionStorage.getItem(RESTART_DISMISSED_KEY);
  } catch {
    return null;
  }
}

function storeDismissed(signature: string): void {
  try {
    sessionStorage.setItem(RESTART_DISMISSED_KEY, signature);
  } catch {
    // storage unavailable: dismissed for this page only
  }
}

/** One watch of a restart: polls until the server answers as a new process, or the deadline passes. */
interface Watch {
  /** The process start time before the restart; null when unknown. */
  before: string | null;
  /** The server stopped answering at least once (a new process when it answers again). */
  sawDown: boolean;
  deadline: number;
  /** The first check runs at once (Check again) instead of after a second. */
  immediate: boolean;
}

/**
 * Restarts of the server (`/api/v1/qcli/server/restart`): the pending list (loaded once, then live from
 * `server:restart-required`), the confirmation, and the full-screen overlay while the server is down. The overlay
 * opens after this page's restart, on `server:restarting` and when the events socket closes with 1012 (another admin
 * restarted it); it polls every second until the server answers with a new `startedAt`, then reconnects the socket,
 * reloads the extensions and the page, and shows "Server restarted". After two minutes it offers Check again and Reload.
 */
export function RestartProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const ws = useOptionalWebSocket();
  const { hasPermission, reload: reloadExtensions } = useExtensions();
  const [status, setStatus] = useState<RestartStatus | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [toast, setToast] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [dismissedFor, setDismissedFor] = useState<string | null>(readDismissed);
  const watch = useRef<Watch | null>(null);
  const [watchKey, setWatchKey] = useState(0);
  // The latest status for event handlers (the start time a restart is measured against)
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const load = useCallback(() => {
    getRestartStatus().then(setStatus, () => { /* kept as it was; the banner is not essential */ });
  }, []);
  useEffect(load, [load]);

  // The pending list changed (a config change, a plugin): the event's list, or the server's when it sends none
  const subscribe = ws?.subscribe;
  useEffect(() => subscribe?.(RESTART_REQUIRED_EVENT, event => {
    if (Array.isArray(event.pending) && statusRef.current) {
      const pending = pendingOf(event.pending);
      setStatus(prev => (prev ? { ...prev, pending } : prev));
    } else {
      load();
    }
  }), [subscribe, load]);

  const reconnect = ws?.reconnect;
  const finish = useCallback((next: RestartStatus | null) => {
    watch.current = null;
    setPhase('idle');
    if (next) setStatus(next);
    else load();
    reconnect?.();
    reloadExtensions();
    setGeneration(g => g + 1);
    setToast(true);
  }, [load, reconnect, reloadExtensions]);

  // While the overlay is up: asks every second whether the server is back as a new process
  useEffect(() => {
    const w = watch.current;
    if (phase !== 'restarting' || !w) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function check(w: Watch) {
      let back = false;
      let next: RestartStatus | null = null;
      if (!(await serverResponds())) {
        w.sawDown = true;
      } else {
        try {
          next = await getRestartStatus({ quiet: true });
          back = next?.startedAt && w.before ? next.startedAt !== w.before : w.sawDown;
        } catch (err) {
          // Sessions did not survive the restart: it is back, and the reload signs in again
          if (err instanceof ApiError && err.status === 401) back = true;
          else w.sawDown = true; // still starting
        }
      }
      if (cancelled || watch.current !== w) return;
      if (back) return finish(next);
      if (Date.now() >= w.deadline) {
        watch.current = null;
        setPhase('timeout');
        return;
      }
      timer = setTimeout(() => void check(w), RESTART_POLL_MS);
    }
    timer = setTimeout(() => void check(w), w.immediate ? 0 : RESTART_POLL_MS);
    w.immediate = false;
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phase, watchKey, finish]);

  /** Opens the overlay and starts polling (once: later triggers of the same restart are ignored). */
  const watchRestart = useCallback((before: string | null, sawDown = false, immediate = false) => {
    if (watch.current) return;
    watch.current = { before, sawDown, immediate, deadline: Date.now() + RESTART_TIMEOUT_MS };
    setConfirming(false);
    setPhase('restarting');
    setWatchKey(k => k + 1);
  }, []);

  // Another admin (or the CLI) restarted the server: the event, or the socket closing with 1012
  const onClose = ws?.onClose;
  useEffect(() => subscribe?.(RESTARTING_EVENT, () => watchRestart(statusRef.current?.startedAt ?? null)), [subscribe, watchRestart]);
  useEffect(() => onClose?.(code => {
    if (code === SERVICE_RESTART_CLOSE_CODE) watchRestart(statusRef.current?.startedAt ?? null, true);
  }), [onClose, watchRestart]);

  useEffect(() => () => {
    watch.current = null;
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(false), RESTART_TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // The timeout's Check again: at once, then every second for another two minutes
  const retryCheck = useCallback(() => watchRestart(statusRef.current?.startedAt ?? null, true, true), [watchRestart]);

  const pending = useMemo(() => status?.pending ?? [], [status]);
  const signature = pendingSignature(pending);
  const permitted = hasPermission(RESTART_PERMISSION);
  const canRestart = !!status?.supported && permitted;

  const value = useMemo<RestartState>(() => {
    const ids = new Set(pending.map(p => p.id));
    return {
      status,
      pending,
      permitted,
      canRestart,
      isPending: id => ids.has(id),
      requestRestart: () => {
        if (!canRestart) return;
        setReason('');
        setConfirming(true);
      },
      dismissed: pending.length > 0 && dismissedFor === signature,
      dismiss: () => {
        storeDismissed(signature);
        setDismissedFor(signature);
      },
      generation,
    };
  }, [status, pending, permitted, canRestart, dismissedFor, signature, generation]);

  return (
    <RestartContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={confirming}
        title={t('restart.confirmTitle')}
        tone="danger"
        size="md"
        confirmLabel={t('restart.confirm')}
        busyLabel={t('restart.starting')}
        message={
          <div className="space-y-3">
            <p>{t('restart.confirmMessage')}</p>
            {pending.length > 0 ? (
              <div>
                <div className="text-xs font-medium text-muted mb-1">{t('restart.confirmPending')}</div>
                <ul className="list-disc pl-5 text-xs text-text space-y-0.5" data-testid="restart-confirm-pending">
                  {pending.map(p => <li key={p.id}>{p.description || p.id}</li>)}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-subtle">{t('restart.confirmNoPending')}</p>
            )}
            <label className="block">
              <span className="block text-xs font-medium text-muted mb-1">{t('restart.reason')}</span>
              <input
                type="text"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder={t('restart.reasonPlaceholder')}
                maxLength={500}
                className="w-full px-3 py-2 text-sm bg-control border border-border rounded-lg text-text placeholder-subtle focus:outline-none focus:border-primary/50"
              />
            </label>
          </div>
        }
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          const before = statusRef.current?.startedAt ?? null;
          await restartServer(reason);
          watchRestart(before);
        }}
      />
      {phase !== 'idle' && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="restart-overlay-title"
          aria-describedby="restart-overlay-hint"
          className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-background/95 motion-safe:animate-fade-in"
        >
          <div className="max-w-sm text-center space-y-3" aria-live="polite">
            {phase === 'restarting' ? (
              <>
                <div className="flex justify-center text-primary"><Spinner size={32} /></div>
                <h2 id="restart-overlay-title" className="text-lg font-semibold text-heading">{t('restart.restarting')}</h2>
                <p id="restart-overlay-hint" className="text-sm text-muted">{t('restart.restartingHint')}</p>
              </>
            ) : (
              <>
                <div aria-hidden className="text-3xl text-warning">⚠</div>
                <h2 id="restart-overlay-title" className="text-lg font-semibold text-heading">{t('restart.notBack')}</h2>
                <p id="restart-overlay-hint" className="text-sm text-muted">{t('restart.notBackHint')}</p>
                <div className="flex flex-wrap justify-center gap-2 pt-1">
                  <button type="button" onClick={retryCheck} className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-on-primary text-sm">
                    {t('restart.retryCheck')}
                  </button>
                  <button type="button" onClick={() => window.location.reload()} className="px-4 py-2 rounded-lg bg-control hover:bg-control-hover text-text text-sm">
                    {t('restart.reloadPage')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {toast && (
        <div
          role="status"
          className="fixed z-[70] bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 left-4 sm:left-auto px-4 py-3 rounded-lg border border-success/30 bg-popover text-sm text-success shadow-xl flex items-center gap-2 motion-safe:animate-pop-in"
        >
          <span aria-hidden>✓</span>
          <span>{t('restart.restarted')}</span>
        </div>
      )}
    </RestartContext.Provider>
  );
}
