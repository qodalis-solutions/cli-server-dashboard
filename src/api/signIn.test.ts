// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consumeFragmentToken, fetchAuthMode, isSafeSignInUrl, onFragmentToken, PASSWORD_MODE, signInHref, signInLabel } from './signIn';
import { apiFetch, getToken, LOGIN_URL, navigation, setToken } from './client';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/qcli/admin/');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('consumeFragmentToken (host handoff)', () => {
  it('stores the token and removes it from the URL', () => {
    window.history.replaceState(null, '', '/qcli/admin/?tab=1#token=host.jwt.value');
    const replace = vi.spyOn(window.history, 'replaceState');

    expect(consumeFragmentToken()).toBe(true);

    expect(localStorage.getItem('qcli_admin_token')).toBe('host.jwt.value');
    expect(window.location.hash).toBe('');
    expect(window.location.pathname + window.location.search).toBe('/qcli/admin/?tab=1');
    expect(window.location.href).not.toContain('host.jwt.value');
    // Replaced, not pushed: the token is not left in history either
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('decodes an encoded token and keeps other fragment parameters', () => {
    window.history.replaceState(null, '', '/qcli/admin/#token=a%2Bb%3Dc&view=jobs');
    expect(consumeFragmentToken()).toBe(true);
    expect(getToken()).toBe('a+b=c');
    expect(window.location.hash).toBe('#view=jobs');
  });

  it('replaces a stored token', () => {
    setToken('old');
    window.history.replaceState(null, '', '/qcli/admin/#token=new');
    consumeFragmentToken();
    expect(getToken()).toBe('new');
  });

  it('does nothing without a token in the fragment', () => {
    setToken('kept');
    window.history.replaceState(null, '', '/qcli/admin/#section');
    expect(consumeFragmentToken()).toBe(false);
    expect(getToken()).toBe('kept');
    expect(window.location.hash).toBe('#section');
  });

  it('drops an empty token parameter without storing it', () => {
    window.history.replaceState(null, '', '/qcli/admin/#token=');
    expect(consumeFragmentToken()).toBe(false);
    expect(getToken()).toBeNull();
    expect(window.location.hash).toBe('');
  });
});

describe('fetchAuthMode', () => {
  it('returns the external mode and its sign-in URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ mode: 'external', signInUrl: 'https://app.example.com/sign-in' }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchAuthMode()).toEqual({ mode: 'external', signInUrl: 'https://app.example.com/sign-in' });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/qcli/auth/mode');
  });

  it('returns password mode', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ mode: 'password', signInUrl: null })));
    expect(await fetchAuthMode()).toEqual(PASSWORD_MODE);
  });

  it('treats a 404 (older server) as password mode', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })));
    expect(await fetchAuthMode()).toEqual(PASSWORD_MODE);
  });

  it('treats a network error as password mode', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await fetchAuthMode()).toEqual(PASSWORD_MODE);
  });

  it('treats a non-JSON body as password mode', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 200 })));
    expect(await fetchAuthMode()).toEqual(PASSWORD_MODE);
  });

  it('never uses an unsafe sign-in URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ mode: 'external', signInUrl: 'javascript:alert(1)' })));
    expect(await fetchAuthMode()).toEqual({ mode: 'external', signInUrl: null });
  });
});

describe('isSafeSignInUrl', () => {
  it.each(['https://app.example.com/sign-in', 'http://localhost:5000/login?next=%2F', '/sign-in', '/'])(
    'accepts %s',
    url => expect(isSafeSignInUrl(url)).toBe(true),
  );

  it.each(['', 'sign-in', '//evil.example.com', '/\\evil.example.com', 'javascript:alert(1)', 'ftp://x.test/a',
    'https://app.example.com/a b', '/a\n', null, 42])('rejects %s', url => expect(isSafeSignInUrl(url)).toBe(false));
});

describe('apiFetch on 401', () => {
  it('drops the token and goes to the sign-in page', async () => {
    setToken('expired');
    const toSignIn = vi.spyOn(navigation, 'toSignIn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: 'Invalid or expired token' }, 401)));

    await expect(apiFetch('/api/v1/qcli/status')).rejects.toThrow('Unauthorized');

    expect(getToken()).toBeNull();
    expect(toSignIn).toHaveBeenCalledTimes(1);
  });

  it('sends the stored token as Bearer', async () => {
    setToken('host-token');
    const fetchMock = vi.fn().mockResolvedValue(json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/api/v1/qcli/status');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer host-token');
  });

  it('leaves anonymous requests and quiet checks on the page', async () => {
    const toSignIn = vi.spyOn(navigation, 'toSignIn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => json({ error: 'no' }, 401)));
    await expect(apiFetch('/api/v1/qcli/auth/login', { anonymous: true })).rejects.toThrow();
    await expect(apiFetch('/api/v1/qcli/auth/me', { quiet: true })).rejects.toThrow('Unauthorized');
    expect(toSignIn).not.toHaveBeenCalled();
  });

  it('targets the sign-in page under the base path', () => {
    expect(LOGIN_URL).toBe('/qcli/admin/login');
  });
});

describe('signInHref (returnTo)', () => {
  const back = 'https://dash.example.com/qcli/admin/link?code=ABCD-2345';
  const encoded = encodeURIComponent(back);

  it('replaces the {returnTo} placeholder', () => {
    expect(signInHref('https://app.example.com/login?next={returnTo}', back)).toBe(`https://app.example.com/login?next=${encoded}`);
    expect(signInHref('/sso/{returnTo}', back)).toBe(`/sso/${encoded}`);
    expect(signInHref('https://app.example.com/login?next=%7BreturnTo%7D', back)).toBe(`https://app.example.com/login?next=${encoded}`);
  });

  it('appends returnTo without a placeholder', () => {
    expect(signInHref('https://app.example.com/login', back)).toBe(`https://app.example.com/login?returnTo=${encoded}`);
    expect(signInHref('/login?tenant=a', back)).toBe(`/login?tenant=a&returnTo=${encoded}`);
    expect(signInHref('/login?', back)).toBe(`/login?returnTo=${encoded}`);
    expect(signInHref('/login#sso', back)).toBe(`/login?returnTo=${encoded}#sso`);
  });

  it('returns to the current page without its fragment by default', () => {
    window.history.replaceState(null, '', '/qcli/admin/jobs?x=1#section');
    expect(signInHref('/login')).toBe(`/login?returnTo=${encodeURIComponent(`${window.location.origin}/qcli/admin/jobs?x=1`)}`);
  });

  it('labels the link without its query', () => {
    expect(signInLabel('https://app.example.com/login?next={returnTo}')).toBe('https://app.example.com/login');
    expect(signInLabel('/sign-in')).toBe('/sign-in');
  });
});

describe('onFragmentToken (handoff into the open page)', () => {
  it('stores the token, strips it and notifies every listener', () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = onFragmentToken(a);
    const offB = onFragmentToken(b);
    window.history.replaceState(null, '', '/qcli/admin/#token=fresh');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(getToken()).toBe('fresh');
    expect(window.location.hash).toBe('');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    offA();
    offB();
    window.history.replaceState(null, '', '/qcli/admin/#token=later');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(getToken()).toBe('fresh');
    expect(a).toHaveBeenCalledTimes(1);
  });

  it('ignores fragments without a token', () => {
    const listener = vi.fn();
    const off = onFragmentToken(listener);
    window.history.replaceState(null, '', '/qcli/admin/#section');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(listener).not.toHaveBeenCalled();
    off();
  });
});
