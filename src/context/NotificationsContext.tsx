import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  dismissNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATION_CHANGED_EVENT,
} from '../api/notifications';
import type { NotificationItem } from '../types';
import { useOptionalWebSocket } from './WebSocketContext';
import { useRestart } from './RestartContext';

/** How many notifications the bell's dropdown lists. */
export const BELL_LIMIT = 8;
/** Events arriving together reload the list once. */
export const NOTIFICATIONS_RELOAD_DELAY = 250;

interface NotificationsState {
  /** False on servers without notifications (404): the bell is hidden. */
  available: boolean;
  /** The latest notifications (null until loaded). */
  latest: NotificationItem[] | null;
  unreadCount: number;
  loading: boolean;
  error: unknown;
  /** Grows on every change the server announces: pages listing notifications load them again. */
  revision: number;
  reload: () => void;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  dismiss: (id: string, everyone?: boolean) => Promise<void>;
}

const NONE: NotificationsState = {
  available: false,
  latest: null,
  unreadCount: 0,
  loading: false,
  error: null,
  revision: 0,
  reload: () => {},
  markRead: async () => {},
  markAllRead: async () => {},
  dismiss: async () => {},
};

const NotificationsContext = createContext<NotificationsState | null>(null);

/** The notifications state; outside a {@link NotificationsProvider}: nothing (no bell). */
export function useNotifications(): NotificationsState {
  return useContext(NotificationsContext) ?? NONE;
}

/**
 * The user's notifications for the bell: the latest few and the unread count, loaded once and again whenever the
 * server sends `notification:changed` (its `unreadCount` is applied at once), after a restart and after the user's
 * own actions.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const ws = useOptionalWebSocket();
  const { generation } = useRestart();
  const [available, setAvailable] = useState(true);
  const [latest, setLatest] = useState<NotificationItem[] | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  const request = useRef(0);

  const reload = useCallback(() => {
    // Quiet: the list stays while it reloads (only the first load shows a skeleton)
    const id = ++request.current;
    getNotifications({ limit: BELL_LIMIT }).then(
      list => {
        if (id !== request.current) return;
        setAvailable(list !== null);
        setLatest(list?.items ?? []);
        setUnreadCount(list?.unreadCount ?? 0);
        setError(null);
        setLoading(false);
      },
      err => {
        if (id !== request.current) return;
        setError(err);
        setLoading(false);
      },
    );
  }, []);

  useEffect(reload, [reload, generation]);

  // Live: the count from the event at once, the list shortly after (several events reload once)
  const subscribe = ws?.subscribe;
  useEffect(() => {
    if (!subscribe) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = subscribe(NOTIFICATION_CHANGED_EVENT, event => {
      if (typeof event.unreadCount === 'number' && event.unreadCount >= 0) setUnreadCount(event.unreadCount);
      setRevision(r => r + 1);
      clearTimeout(timer);
      timer = setTimeout(reload, NOTIFICATIONS_RELOAD_DELAY);
    });
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [subscribe, reload]);

  const after = useCallback((count: number | null) => {
    if (count !== null) setUnreadCount(count);
    setRevision(r => r + 1);
    reload();
  }, [reload]);

  const value = useMemo<NotificationsState>(() => ({
    available,
    latest,
    unreadCount,
    loading,
    error,
    revision,
    reload,
    markRead: async id => {
      setLatest(prev => prev?.map(n => (n.id === id ? { ...n, read: true } : n)) ?? prev);
      after(await markNotificationRead(id));
    },
    markAllRead: async () => {
      setLatest(prev => prev?.map(n => ({ ...n, read: true })) ?? prev);
      after(await markAllNotificationsRead());
    },
    dismiss: async (id, everyone = false) => {
      setLatest(prev => prev?.filter(n => n.id !== id) ?? prev);
      after(await dismissNotification(id, everyone));
    },
  }), [available, latest, unreadCount, loading, error, revision, reload, after]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}
