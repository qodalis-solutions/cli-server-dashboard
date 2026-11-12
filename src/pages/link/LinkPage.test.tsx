// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import LinkPage from './LinkPage';
import { I18nProvider } from '../../i18n';
import { normalizeCode } from '../../api/link';
import { consumeFragmentToken } from '../../api/signIn';

const REQUEST = {
  userCode: 'ABCD-2345',
  client: 'Qodalis CLI on Pixel 7',
  origin: 'https://cli.qodalis.com',
  remoteAddress: '10.0.0.4',
  permissions: null,
  createdAt: 0,
  expiresAt: 0,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type Handler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

function server(handler: Handler) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/auth/mode')) return json({ mode: 'password' });
    return handler(url, init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage(path: string) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/link" element={<LinkPage />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

const authOf = (init?: RequestInit) => (init?.headers as Record<string, string> | undefined)?.Authorization;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('qcli_admin_locale', 'en');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('normalizeCode', () => {
  it('accepts codes as typed', () => {
    expect(normalizeCode('abcd2345')).toBe('ABCD-2345');
    expect(normalizeCode(' ABCD-2345 ')).toBe('ABCD-2345');
    expect(normalizeCode('ABC')).toBeNull();
  });
});

describe('LinkPage', () => {
  it('signs in, shows the request and approves it', async () => {
    const decisions: string[] = [];
    server((url, init) => {
      if (url === '/api/v1/qcli/sessions') return json({ token: 'session-1' }, 201);
      if (url.endsWith('/approve')) {
        decisions.push(`approve ${authOf(init)}`);
        return json({ tokenId: 't1', tokenName: 'link Qodalis CLI on Pixel 7' });
      }
      return authOf(init) === 'Bearer session-1' ? json(REQUEST) : json({ error: 'unauthorized' }, 401);
    });
    renderPage('/link?code=abcd-2345');

    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'ann' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'annpass12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Qodalis CLI on Pixel 7')).toBeTruthy();
    expect(screen.getByText('ABCD-2345')).toBeTruthy();
    expect(screen.getByText('https://cli.qodalis.com')).toBeTruthy();
    expect(screen.getByText('All your permissions')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Terminal linked')).toBeTruthy();
    expect(screen.getByText('You can go back to your terminal.')).toBeTruthy();
    expect(decisions).toEqual(['approve Bearer session-1']);
    // The session made on this page is not kept as the dashboard's token
    expect(localStorage.getItem('qcli_admin_token')).toBeNull();
  });

  it('uses the dashboard session when there is one, and denies', async () => {
    localStorage.setItem('qcli_admin_token', 'admin-1');
    const calls: string[] = [];
    server((url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${url} ${authOf(init)}`);
      if (url.endsWith('/deny')) return new Response(null, { status: 204 });
      return json({ ...REQUEST, permissions: ['commands:execute'] });
    });
    renderPage('/link?code=ABCD-2345');

    expect(await screen.findByText('commands:execute')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
    expect(await screen.findByText('Request denied')).toBeTruthy();
    expect(calls).toContain('POST /api/v1/qcli/link/code/ABCD-2345/deny Bearer admin-1');
  });

  it('asks for the code when the URL has none, and says when it expired', async () => {
    localStorage.setItem('qcli_admin_token', 'admin-1');
    server(() => json({ error: 'link request not found or expired' }, 404));
    renderPage('/link');

    fireEvent.change(await screen.findByLabelText('Code'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/8 letters and digits/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'wxyz9876' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/unknown or expired/)).toBeTruthy();
  });

  it('a wrong password keeps the form with an error', async () => {
    server((url) => (url === '/api/v1/qcli/sessions' ? json({ error: 'invalid credentials' }, 401) : json({ error: 'unauthorized' }, 401)));
    renderPage('/link?code=ABCD-2345');
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'ann' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Invalid credentials')).toBeTruthy();
  });

  it('flags a code in the link that cannot be one, keeping it in the form', async () => {
    server(() => json(REQUEST));
    renderPage('/link?code=ABCD-23');
    expect(await screen.findByText(/8 letters and digits/)).toBeTruthy();
    expect((screen.getByLabelText('Code') as HTMLInputElement).value).toBe('ABCD-23');
  });

  it('offers a retry when a decision fails, and signs in again when the session ended', async () => {
    localStorage.setItem('qcli_admin_token', 'admin-1');
    let approve = 0;
    server((url) => {
      if (url.endsWith('/approve')) {
        approve++;
        if (approve === 1) throw new TypeError('Failed to fetch');
        return json({ error: 'unauthorized' }, 401);
      }
      return json(REQUEST);
    });
    renderPage('/link?code=ABCD-2345');

    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Failed to fetch')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByLabelText('Username')).toBeTruthy();
  });
});

describe('external sign-in for a link request', () => {
  function externalServer(validToken: string) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/mode')) return json({ mode: 'external', signInUrl: 'https://app.example.com/login?next={returnTo}' });
      return authOf(init) === `Bearer ${validToken}` ? json(REQUEST) : json({ error: 'sign in' }, 401);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('links to the host sign-in with this page as returnTo', async () => {
    externalServer('session');
    window.history.replaceState(null, '', '/qcli/admin/link?code=ABCD-2345');
    renderPage('/link?code=ABCD-2345');

    const link = await screen.findByRole('link', { name: 'Sign in at https://app.example.com/login' });
    expect(link.getAttribute('href')).toBe(
      `https://app.example.com/login?next=${encodeURIComponent(`${window.location.origin}/qcli/admin/link?code=ABCD-2345`)}`,
    );
  });

  it('picks up the #token= handoff on return (page load)', async () => {
    externalServer('session');
    window.history.replaceState(null, '', '/qcli/admin/link?code=ABCD-2345#token=session');
    consumeFragmentToken(); // main.tsx, before the first render
    expect(window.location.hash).toBe('');
    expect(window.location.search).toBe('?code=ABCD-2345');

    renderPage('/link?code=ABCD-2345');
    expect(await screen.findByText('Qodalis CLI on Pixel 7')).toBeTruthy();
  });

  it('picks up a #token= handoff into the open page', async () => {
    externalServer('session');
    window.history.replaceState(null, '', '/qcli/admin/link?code=ABCD-2345');
    renderPage('/link?code=ABCD-2345');
    await screen.findByRole('link', { name: /Sign in at/ });

    act(() => {
      window.history.replaceState(null, '', '/qcli/admin/link?code=ABCD-2345#token=session');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(await screen.findByText('Qodalis CLI on Pixel 7')).toBeTruthy();
    expect(localStorage.getItem('qcli_admin_token')).toBe('session');
    expect(window.location.hash).toBe('');
  });
});
