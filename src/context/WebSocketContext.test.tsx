// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useEffect, useState } from 'react';
import {
  RECONNECT_MAX_MS,
  STABLE_CONNECTION_MS,
  WebSocketProvider,
  reconnectDelay,
  useWebSocket,
} from './WebSocketContext';
import { setToken } from '../api/client';
import { FakeWebSocket } from '../test/fakes';

/** A consumer that re-subscribes and re-renders, like the pages do. */
function Consumer({ onEvent }: { onEvent: (e: Record<string, unknown>) => void }) {
  const { subscribe } = useWebSocket();
  const [, setTick] = useState(0);
  useEffect(() => subscribe('job:*', e => {
    onEvent(e);
    setTick(t => t + 1);
  }), [subscribe, onEvent]);
  return null;
}

const sockets = () => FakeWebSocket.instances;
const last = () => sockets()[sockets().length - 1];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  localStorage.clear();
  setToken('good-token');
  FakeWebSocket.install();
  // Servers without the users plugin: no ticket endpoint, legacy token parameter
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Lets the async ticket request and the socket creation run. */
const flush = () => advance(0);

describe('reconnectDelay', () => {
  it('doubles from 1s and caps at 30s', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 50].map(reconnectDelay)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    expect(RECONNECT_MAX_MS).toBe(30000);
  });
});

describe('WebSocketProvider', () => {
  it('reconnects with exponential backoff, capped, while the server keeps dropping the socket', async () => {
    render(<WebSocketProvider><Consumer onEvent={() => {}} /></WebSocketProvider>);
    await flush();
    expect(sockets()).toHaveLength(1);

    const expected = [1000, 2000, 4000, 8000, 16000, 30000, 30000];
    for (const delay of expected) {
      // Accepted, then dropped right away: no reset of the backoff
      act(() => last().open());
      act(() => last().drop());
      const before = sockets().length;
      await advance(delay - 1);
      expect(sockets()).toHaveLength(before);
      await advance(1);
      expect(sockets()).toHaveLength(before + 1);
    }
  });

  it('starts the backoff over after a stable connection', async () => {
    render(<WebSocketProvider><Consumer onEvent={() => {}} /></WebSocketProvider>);
    await flush();

    // Two quick failures: next delay would be 4s
    act(() => last().drop());
    await advance(1000);
    act(() => last().drop());
    await advance(2000);
    expect(sockets()).toHaveLength(3);

    // This one stays up long enough
    act(() => last().open());
    await advance(STABLE_CONNECTION_MS);
    act(() => last().drop());
    await advance(1000);
    expect(sockets()).toHaveLength(4);
  });

  it('keeps one socket while consumers re-render and re-subscribe, and dispatches to them', async () => {
    const received: unknown[] = [];
    const onEvent = (e: Record<string, unknown>) => received.push(e.type);
    const { rerender } = render(<WebSocketProvider><Consumer onEvent={onEvent} /></WebSocketProvider>);
    await flush();
    act(() => last().open());

    for (let i = 0; i < 5; i++) {
      rerender(<WebSocketProvider><Consumer onEvent={(e) => onEvent(e)} /></WebSocketProvider>);
      act(() => last().emit({ type: 'job:started', jobId: String(i) }));
    }
    rerender(<WebSocketProvider><></></WebSocketProvider>);
    act(() => last().emit({ type: 'job:started' }));

    expect(sockets()).toHaveLength(1);
    expect(received).toHaveLength(5);
  });

  it('closes the socket and stops reconnecting when disabled (signed out)', async () => {
    const { rerender } = render(<WebSocketProvider enabled><></></WebSocketProvider>);
    await flush();
    act(() => last().open());

    rerender(<WebSocketProvider enabled={false}><></></WebSocketProvider>);
    expect(last().readyState).toBe(FakeWebSocket.CLOSED);
    await advance(60000);
    expect(sockets()).toHaveLength(1);
  });

  it('does not open a socket after unmount while the ticket request is in flight', async () => {
    const { unmount } = render(<WebSocketProvider><></></WebSocketProvider>);
    unmount();
    await flush();
    expect(sockets()).toHaveLength(0);
  });
});
