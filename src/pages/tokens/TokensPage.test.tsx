// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import TokensPage from './TokensPage';
import { I18nProvider } from '../../i18n';

const DAY = 86_400_000;
const NOW = Date.now();
const TOKENS = [
  { id: 't1', name: 'ci', userId: 'u1', userName: 'root', createdAt: NOW - 30 * DAY, expiresAt: NOW - DAY, lastUsedAt: null, permissions: ['commands:execute'] },
  { id: 't2', name: 'link Qodalis CLI on Pixel 7', userId: 'u1', userName: 'root', createdAt: NOW - DAY, expiresAt: null, lastUsedAt: NOW - 60_000 },
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function renderPage() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/tokens']}>
        <TokensPage />
      </MemoryRouter>
    </I18nProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('qcli_admin_locale', 'en');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('TokensPage', () => {
  it('lists tokens, marks linked terminals and revokes one', async () => {
    let tokens = [...TOKENS];
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (init?.method === 'DELETE') {
        tokens = tokens.filter(t => !url.endsWith(`/${t.id}`));
        return new Response(null, { status: 204 });
      }
      return json(tokens);
    }));
    renderPage();

    expect(await screen.findByText('Qodalis CLI on Pixel 7')).toBeTruthy();
    expect(screen.getByText('Linked terminal')).toBeTruthy();
    expect(screen.getByText('Expired')).toBeTruthy();
    expect(screen.getByText('commands:execute')).toBeTruthy();
    expect(screen.getByText('2 tokens · 1 linked terminal')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke link Qodalis CLI on Pixel 7' }));
    const dialog = screen.getByRole('dialog', { name: 'Revoke token' });
    expect(within(dialog).getByText(/Unlink Qodalis CLI on Pixel 7\?/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }));

    await waitFor(() => expect(screen.queryByText('Qodalis CLI on Pixel 7')).toBeNull());
    expect(calls).toContain('DELETE /api/v1/qcli/tokens/t2');
  });

  it('shows everyone’s tokens with their owner, and the server’s refusal', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('?all=true') ? json({ error: 'forbidden: missing permission tokens:read' }, 403) : json(TOKENS)));
    renderPage();

    await screen.findByText('ci');
    expect(screen.queryByText('Owner')).toBeNull();
    fireEvent.click(screen.getByLabelText('All users'));
    expect(await screen.findByText('Error: forbidden: missing permission tokens:read')).toBeTruthy();
  });
});
