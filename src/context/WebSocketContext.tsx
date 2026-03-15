import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { getToken } from '../api/client';

type WsStatus = 'connected' | 'disconnected' | 'reconnecting';
type EventHandler = (event: Record<string, unknown>) => void;

interface WsState {
  status: WsStatus;
  subscribe: (type: string, handler: EventHandler) => () => void;
}

const WsContext = createContext<WsState | null>(null);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WsStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef(new Map<string, Set<EventHandler>>());
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    const token = getToken();
    if (!token) return;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/v1/qcli/events?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      retryRef.current = 0;
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        const type = data.type as string;
        // Dispatch to exact type subscribers
        listenersRef.current.get(type)?.forEach(fn => fn(data));
        // Dispatch to wildcard subscribers (e.g. "job:*" matches "job:started")
        listenersRef.current.forEach((handlers, pattern) => {
          if (pattern.endsWith('*') && type.startsWith(pattern.slice(0, -1))) {
            handlers.forEach(fn => fn(data));
          }
        });
        // Dispatch to "*" (all events) subscribers
        listenersRef.current.get('*')?.forEach(fn => fn(data));
      } catch { /* ignore non-JSON */ }
    };

    ws.onclose = () => {
      setStatus('reconnecting');
      const delay = Math.min(1000 * 2 ** retryRef.current, 30000);
      retryRef.current++;
      timerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const subscribe = useCallback((type: string, handler: EventHandler) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, new Set());
    }
    listenersRef.current.get(type)!.add(handler);
    return () => {
      listenersRef.current.get(type)?.delete(handler);
    };
  }, []);

  return (
    <WsContext.Provider value={{ status, subscribe }}>
      {children}
    </WsContext.Provider>
  );
}

export function useWebSocket() {
  const ctx = useContext(WsContext);
  if (!ctx) throw new Error('useWebSocket must be used within WebSocketProvider');
  return ctx;
}
