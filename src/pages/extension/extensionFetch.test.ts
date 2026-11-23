// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extensionFetch } from './extensionFetch';
import { getToken, navigation, setToken } from '../../api/client';

beforeEach(() => {
  localStorage.clear();
  setToken('tok');
  vi.spyOn(navigation, 'toSignIn').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('extensionFetch', () => {
  it('signs out on a 401 of a request that carried the token', async () => {
    const res = await extensionFetch('/api/v1/qcli/jobs');
    expect(res.status).toBe(401);
    expect(getToken()).toBeNull();
    expect(navigation.toSignIn).toHaveBeenCalledOnce();
  });

  it('keeps the session on a 401 of a quiet request, and does not send the flag on', async () => {
    const res = await extensionFetch('/api/v1/qcli/permissions', { quiet: true });
    expect(res.status).toBe(401);
    expect(getToken()).toBe('tok');
    expect(navigation.toSignIn).not.toHaveBeenCalled();
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit & { quiet?: boolean };
    expect(init.quiet).toBeUndefined();
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok');
  });
});
