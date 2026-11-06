// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { WebSocketProvider } from '../context/WebSocketContext';
import { setToken } from '../api/client';
import { FakeWebSocket } from '../test/fakes';
import { LIVE_RELOAD_DELAY, matchesEventPattern, useLiveReload, type LiveReloadOptions } from './useLiveReload';

function Reloader({ patterns, reload, options }: { patterns: string | string[]; reload: () => void; options?: LiveReloadOptions }) {
  useLiveReload(patterns, reload, options);
  return null;
}

const last = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  localStorage.clear();
  setToken('good-token');
  FakeWebSocket.install();
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

/** Mounts the hook under a connected provider. */
async function mount(patterns: string | string[], options?: LiveReloadOptions) {
  const reload = vi.fn();
  const view = render(<WebSocketProvider><Reloader patterns={patterns} reload={reload} options={options} /></WebSocketProvider>);
  await advance(0);
  act(() => last().open());
  const emit = (event: Record<string, unknown>) => act(() => last().emit(event));
  const rerender = (next?: LiveReloadOptions) =>
    view.rerender(<WebSocketProvider><Reloader patterns={patterns} reload={reload} options={next} /></WebSocketProvider>);
  return { reload, emit, rerender, unmount: view.unmount };
}

describe('matchesEventPattern', () => {
  it('matches everything, a namespace, or one type', () => {
    expect(matchesEventPattern('job:started', '*')).toBe(true);
    expect(matchesEventPattern('job:started', 'job:*')).toBe(true);
    expect(matchesEventPattern('jobs:started', 'job:*')).toBe(false);
    expect(matchesEventPattern('fs:changed', 'fs:changed')).toBe(true);
    expect(matchesEventPattern('fs:changed-later', 'fs:changed')).toBe(false);
  });
});

describe('useLiveReload', () => {
  it('reloads once, a moment after a burst of matching events', async () => {
    const { reload, emit } = await mount('job:*');
    emit({ type: 'job:started', jobId: 'a' });
    await advance(LIVE_RELOAD_DELAY - 100);
    emit({ type: 'job:completed', jobId: 'a' });
    emit({ type: 'user:created' });
    await advance(LIVE_RELOAD_DELAY - 1);
    expect(reload).not.toHaveBeenCalled();
    await advance(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ignores other types and events the filter rejects', async () => {
    const { reload, emit } = await mount(['user:*', 'group:*'], { filter: e => e.username !== 'skip' });
    emit({ type: 'token:created' });
    emit({ type: 'user:updated', username: 'skip' });
    await advance(LIVE_RELOAD_DELAY * 2);
    expect(reload).not.toHaveBeenCalled();
    emit({ type: 'group:deleted', group: 'ops' });
    await advance(LIVE_RELOAD_DELAY);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads once for an event matching several patterns', async () => {
    const { reload, emit } = await mount(['job:*', '*']);
    emit({ type: 'job:updated', jobId: 'a' });
    await advance(LIVE_RELOAD_DELAY);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('holds reloads while paused and runs one when resumed', async () => {
    const { reload, emit, rerender } = await mount('fs:changed', { paused: true });
    emit({ type: 'fs:changed', path: '/a' });
    emit({ type: 'fs:changed', path: '/b' });
    await advance(LIVE_RELOAD_DELAY * 2);
    expect(reload).not.toHaveBeenCalled();
    rerender({ paused: false });
    await advance(LIVE_RELOAD_DELAY);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('keeps a reload that was waiting when the page pauses', async () => {
    const { reload, emit, rerender } = await mount('audit:recorded', { paused: false });
    emit({ type: 'audit:recorded' });
    rerender({ paused: true });
    await advance(LIVE_RELOAD_DELAY * 2);
    expect(reload).not.toHaveBeenCalled();
    rerender({ paused: false });
    await advance(LIVE_RELOAD_DELAY);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload on resume without events', async () => {
    const { reload, emit, rerender } = await mount('job:*', { paused: false });
    emit({ type: 'job:started' });
    await advance(LIVE_RELOAD_DELAY);
    expect(reload).toHaveBeenCalledTimes(1);
    rerender({ paused: true });
    rerender({ paused: false });
    await advance(LIVE_RELOAD_DELAY * 2);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes and drops a waiting reload on unmount', async () => {
    const { reload, emit, unmount } = await mount('job:*');
    emit({ type: 'job:started' });
    unmount();
    await advance(LIVE_RELOAD_DELAY * 2);
    expect(reload).not.toHaveBeenCalled();
  });
});
