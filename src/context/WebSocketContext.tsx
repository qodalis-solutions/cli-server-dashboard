import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from 'react';
import { buildWebSocketUrl } from '../api/client';

type WsStatus = 'connected' | 'disconnected' | 'reconnecting';
type EventHandler = (event: Record<string, unknown>) => void;

interface WsState {
  status: WsStatus;
  subscribe: (type: string, handler: EventHandler) => () => void;
}

export const EVENTS_SOCKET_PATH = '/ws/v1/qcli/events';
/** First reconnect delay; doubles per failed attempt. */
export const RECONNECT_BASE_MS = 1000;
/** Longest reconnect delay. */
export const RECONNECT_MAX_MS = 30000;
/**
 * A connection must stay open this long before the backoff starts over. Resetting on `open`
 * alone turns a server that accepts and then drops the socket into a reconnect every second.
 */
export const STABLE_CONNECTION_MS = 10000;

/** Delay before reconnect attempt `attempt` (0-based): 1s, 2s, 4s … capped at 30s. */
export function reconnectDelay(attempt: number): number {
  return Math.min(RECONNECT_BASE_MS * 2 ** Math.min(attempt, 30), RECONNECT_MAX_MS);
}

const WsContext = createContext<WsState | null>(null);

/**
 * The app's single events WebSocket. Mount it once, above the routes: it connects while
 * `enabled` (signed in) and is never re-created by route changes or re-renders; subscribers
 * come and go through {@link WsState.subscribe} without touching the socket.
 */
export function WebSocketProvider({ enabled = true, children }: { enabled?: boolean; children: ReactNode }) {
  const [status, setStatus] = useState<WsStatus>('disconnected');
  const listenersRef = useRef(new Map<string, Set<EventHandler>>());

  useEffect(() => {
    if (!enabled) return;

    // Per-connection-lifetime state: a ticket request still in flight when this effect is
    // cleaned up (sign-out, StrictMode re-run) must not open a second socket afterwards.
    let disposed = false;
    let ws: WebSocket | null = null;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let stableTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleReconnect = () => {
      if (disposed) return;
      setStatus('reconnecting');
      const delay = reconnectDelay(attempt);
      attempt++;
      retryTimer = setTimeout(() => void connect(), delay);
    };

    const dispatch = (raw: unknown) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(String(raw));
      } catch {
        return; // ignore non-JSON
      }
      const type = String(data.type ?? '');
      const listeners = listenersRef.current;
      // Exact type subscribers
      listeners.get(type)?.forEach(fn => fn(data));
      // Prefix subscribers ("job:*" matches "job:started"); "*" is handled below
      listeners.forEach((handlers, pattern) => {
        if (pattern !== '*' && pattern.endsWith('*') && type.startsWith(pattern.slice(0, -1))) {
          handlers.forEach(fn => fn(data));
        }
      });
      // All-events subscribers
      listeners.get('*')?.forEach(fn => fn(data));
    };

    const connect = async () => {
      // A fresh single-use ticket per attempt (see buildWebSocketUrl)
      let url: string | null;
      try {
        url = await buildWebSocketUrl(EVENTS_SOCKET_PATH);
      } catch {
        // No ticket now (server down or failing): try again later, never with the token in the URL
        if (!disposed) scheduleReconnect();
        return;
      }
      if (disposed) return;
      if (!url) {
        // Signed out or the session ended: the next API call sends the user to sign-in.
        setStatus('disconnected');
        return;
      }

      const socket = new WebSocket(url);
      ws = socket;

      socket.onopen = () => {
        setStatus('connected');
        clearTimeout(stableTimer);
        stableTimer = setTimeout(() => {
          attempt = 0;
        }, STABLE_CONNECTION_MS);
      };
      socket.onmessage = e => dispatch(e.data);
      socket.onclose = () => {
        clearTimeout(stableTimer);
        if (ws === socket) ws = null;
        scheduleReconnect();
      };
      socket.onerror = () => socket.close();
    };

    void connect();
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      clearTimeout(stableTimer);
      if (ws) {
        ws.onclose = null;
        ws.close();
        ws = null;
      }
    };
  }, [enabled]);

  const subscribe = useCallback((type: string, handler: EventHandler) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, new Set());
    }
    listenersRef.current.get(type)!.add(handler);
    return () => {
      listenersRef.current.get(type)?.delete(handler);
    };
  }, []);

  const value = useMemo(
    () => ({ status: enabled ? status : ('disconnected' as const), subscribe }),
    [enabled, status, subscribe],
  );

  return <WsContext.Provider value={value}>{children}</WsContext.Provider>;
}

export function useWebSocket() {
  const ctx = useContext(WsContext);
  if (!ctx) throw new Error('useWebSocket must be used within WebSocketProvider');
  return ctx;
}
