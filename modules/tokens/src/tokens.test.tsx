// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { LOCALES, type DashboardExtension } from '@qodalis/cli-server-dashboard-kit';
import extension from './index';
import { messages } from './messages';
import { fakeDashboard, json, mountExtension, type FakeServer } from '@qodalis/cli-server-dashboard-kit/testing';

const DAY = 86_400_000;
const NOW = Date.now();
const TOKENS = [
  { id: 't1', name: 'ci', userId: 'u1', userName: 'root', createdAt: NOW - 30 * DAY, expiresAt: NOW - DAY, lastUsedAt: null, permissions: ['commands:execute'] },
  { id: 't2', name: 'link Qodalis CLI on Pixel 7', userId: 'u1', userName: 'root', createdAt: NOW - DAY, expiresAt: null, lastUsedAt: NOW - 60_000 },
];

const PERMISSIONS = '/api/v1/qcli/permissions';

let unmount: (() => void) | undefined;
let dashboard: ReturnType<typeof fakeDashboard>;

async function renderPage(server: FakeServer, options: { permissions?: string[]; language?: string } = {}) {
  dashboard = fakeDashboard('tokens', { server, ...options });
  unmount = await mountExtension(extension as DashboardExtension, dashboard.context);
}

afterEach(() => {
  unmount?.();
  unmount = undefined;
  cleanup();
  vi.unstubAllGlobals();
});

describe('TokensPage', () => {
  it('lists tokens, marks linked terminals and revokes one', async () => {
    let tokens = [...TOKENS];
    const calls: string[] = [];
    const server: FakeServer = async (input: string, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.startsWith(PERMISSIONS)) return json([]);
      if (init?.method === 'DELETE') {
        tokens = tokens.filter(t => !url.endsWith(`/${t.id}`));
        return new Response(null, { status: 204 });
      }
      return json(tokens);
    };
    await renderPage(server);

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
    const server: FakeServer = async (input: string) =>
      String(input).startsWith(PERMISSIONS) ? json([]) : String(input).endsWith('?all=true') ? json({ error: 'forbidden: missing permission tokens:read' }, 403) : json(TOKENS);
    await renderPage(server);

    await screen.findByText('ci');
    expect(screen.queryByText('Owner')).toBeNull();
    fireEvent.click(screen.getByLabelText('All users'));
    expect(await screen.findByText('Error: forbidden: missing permission tokens:read')).toBeTruthy();
  });

  it('creates a token, shows it once with a copy button and refreshes the list', async () => {
    let tokens = [TOKENS[0]];
    let posted: unknown = null;
    const server: FakeServer = async (input: string, init?: RequestInit) => {
      if (String(input).startsWith(PERMISSIONS)) return json({ error: 'Not Found' }, 404);
      if (init?.method === 'POST') {
        posted = JSON.parse(String(init.body));
        const apiToken = { id: 't3', name: 'deploy', userId: 'u1', userName: 'root', createdAt: NOW, expiresAt: NOW + 30 * DAY, lastUsedAt: null, permissions: ['commands:execute'] };
        tokens = [...tokens, apiToken];
        return json({ token: 'qcli_pat_secret', apiToken }, 201);
      }
      return json(tokens);
    };
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    await renderPage(server);
    await screen.findByText('ci');

    fireEvent.click(screen.getByRole('button', { name: 'New token' }));
    const dialog = screen.getByRole('dialog', { name: 'New API token' });
    const create = within(dialog).getByRole('button', { name: 'Create' }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    expect((within(dialog).getByLabelText('Expires in (days)') as HTMLInputElement).value).toBe('90');

    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'deploy' } });
    fireEvent.change(within(dialog).getByLabelText('Expires in (days)'), { target: { value: '400' } });
    expect(create.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('Expires in (days)'), { target: { value: '30' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Selected' }));
    await within(dialog).findByText('This server does not list its permissions; type them below.');
    fireEvent.change(within(dialog).getByLabelText('Other permissions'), { target: { value: 'commands:execute,  commands:execute' } });
    fireEvent.click(create);

    const shown = await screen.findByRole('dialog', { name: 'Token created' });
    expect(posted).toEqual({ name: 'deploy', expiresInDays: 30, permissions: ['commands:execute'] });
    expect((within(shown).getByLabelText('API token') as HTMLInputElement).value).toBe('qcli_pat_secret');
    expect(within(shown).getByText(/won’t be shown again/)).toBeTruthy();
    fireEvent.click(within(shown).getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('qcli_pat_secret');
    expect(await within(shown).findByRole('button', { name: 'Copied' })).toBeTruthy();
    expect(await screen.findByText('deploy')).toBeTruthy();

    // Escape does not lose the token; Done closes
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Token created' })).toBeTruthy();
    fireEvent.click(within(shown).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.textContent).not.toContain('qcli_pat_secret');
  });

  it.each([
    [501, { error: 'API tokens are not available with external authentication' }, 'This server does not issue API tokens: sign-in is managed by the host application.'],
    [403, { error: 'forbidden: cannot grant users:write' }, 'Not allowed: forbidden: cannot grant users:write'],
    [409, { error: "token 'ci' already exists" }, "The token could not be created: token 'ci' already exists"],
  ])('shows the server’s refusal (%i)', async (status, body, message) => {
    const server: FakeServer = (input: string, init?: RequestInit) =>
      String(input).startsWith(PERMISSIONS) ? json([]) : init?.method === 'POST' ? json(body, status) : json(TOKENS);
    await renderPage(server);
    await screen.findByText('ci');

    fireEvent.click(screen.getByRole('button', { name: 'New token' }));
    const dialog = screen.getByRole('dialog', { name: 'New API token' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'ci' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe(message);
  });

  it('describes the permission chips from the server’s catalog and marks host tokens', async () => {
    const hostToken = { id: 't3', name: 'rates-free', userId: 'u1', userName: 'root', createdAt: NOW, expiresAt: null, lastUsedAt: null, audience: 'host', permissions: ['rates:read'] };
    const server: FakeServer = async (input: string) => String(input).startsWith(PERMISSIONS)
      ? json([{ name: 'commands:execute', description: 'Run commands on the server', group: 'Commands', surface: 'cli' }])
      : json([...TOKENS, hostToken]);
    await renderPage(server);

    await waitFor(() => expect(screen.getByText('commands:execute').getAttribute('title')).toBe('Run commands on the server'));
    expect(screen.getByText('rates:read').getAttribute('title')).toBeNull();
    const badge = screen.getByText('Host');
    expect(badge.closest('[title]')?.getAttribute('title')).toBe('Created by the host application; works only on its own API.');
    expect(screen.getAllByText('Host')).toHaveLength(1);
  });

  it('shows the chips without descriptions on a server without /permissions', async () => {
    const calls: string[] = [];
    const server: FakeServer = async (input: string) => {
      calls.push(String(input));
      return String(input).startsWith(PERMISSIONS) ? json({ error: 'Not Found' }, 404) : json(TOKENS);
    };
    await renderPage(server);

    await screen.findByText('commands:execute');
    await waitFor(() => expect(calls).toContain(PERMISSIONS));
    expect(screen.getByText('commands:execute').getAttribute('title')).toBeNull();
    expect(screen.queryByText('Host')).toBeNull();
  });

  it('keeps the chips plain when /permissions answers 401', async () => {
    const calls: string[] = [];
    const server: FakeServer = (input: string) => {
      calls.push(String(input));
      return String(input).startsWith(PERMISSIONS) ? json({ error: 'unauthorized' }, 401) : json(TOKENS);
    };
    await renderPage(server);
    await screen.findByText('commands:execute');
    await waitFor(() => expect(calls).toContain(PERMISSIONS));
    expect(screen.getByText('commands:execute').getAttribute('title')).toBeNull();
    // Asked quietly: the dashboard does not sign out over it
    expect(dashboard.state.requests.find(r => r.path === PERMISSIONS)).toMatchObject({ quiet: true });
  });

  it('offers everyone’s tokens only with tokens:read', async () => {
    await renderPage(() => json(TOKENS), { permissions: ['admin:access'] });
    await screen.findByText('ci');
    expect(screen.queryByLabelText('All users')).toBeNull();
    expect(dashboard.state.requests.some(r => r.path.endsWith('?all=true'))).toBe(false);
  });

  it('keeps “all users” in the page’s query', async () => {
    await renderPage(path => json(String(path).endsWith('?all=true') ? [...TOKENS, { ...TOKENS[0], id: 't9', name: 'other', userName: 'alice' }] : TOKENS));
    await screen.findByText('ci');
    fireEvent.click(screen.getByLabelText('All users'));
    expect(dashboard.state.path).toBe('/?all=true');
    expect(await screen.findByText('alice')).toBeTruthy();
  });

  it('hands its catalog to the new-token dialog', async () => {
    const calls: string[] = [];
    const server: FakeServer = async (input: string) => {
      calls.push(String(input));
      return String(input).startsWith(PERMISSIONS)
        ? json([{ name: 'commands:execute', description: 'Run commands on the server', group: 'Commands', surface: 'cli' }])
        : json(TOKENS);
    };
    await renderPage(server);
    await waitFor(() => expect(screen.getByText('commands:execute').getAttribute('title')).toBe('Run commands on the server'));

    fireEvent.click(screen.getByRole('button', { name: 'New token' }));
    const dialog = screen.getByRole('dialog', { name: 'New API token' });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Selected' }));
    expect(within(dialog).getByLabelText('commands:execute')).toBeTruthy();
    expect(calls.filter(c => c.startsWith(PERMISSIONS))).toHaveLength(1);
  });
});

describe('TokensPage usage column', () => {
  const days = (today: number, total: number) => Array.from({ length: 30 }, (_, i) => ({
    date: new Date(NOW - (29 - i) * DAY).toISOString().slice(0, 10),
    requests: i === 29 ? today : i === 0 ? total - today : 0,
  }));
  const usage = (today: number, total: number) => ({ today, last30Days: total, days: days(today, total) });

  const serve = (tokens: unknown[]): FakeServer => (input: string) => (String(input).startsWith(PERMISSIONS) ? json([]) : json(tokens));

  it('no usage → no Requests today column', async () => {
    await renderPage(serve(TOKENS));

    await screen.findByText('ci');
    expect(screen.queryByRole('columnheader', { name: /Requests today/ })).toBeNull();
  });

  it('usage → column with today\'s count and the 30-day tooltip', async () => {
    await renderPage(serve([{ ...TOKENS[0], usage: usage(1234, 5678) }]));

    await screen.findByText('ci');
    expect(screen.getByRole('columnheader', { name: /Requests today/ })).toBeTruthy();
    const today = screen.getByText('1,234');
    fireEvent.focus(today);
    expect((await screen.findByRole('tooltip')).textContent).toBe('Last 30 days: 5,678');
  });

  it('mixed tokens (one without usage) → shows "–" for it', async () => {
    await renderPage(serve([{ ...TOKENS[0], usage: usage(12, 340) }, TOKENS[1]]));

    await screen.findByText('ci');
    const rows = screen.getAllByRole('row');
    const linked = rows.find(r => within(r).queryByText('Qodalis CLI on Pixel 7'))!;
    const ci = rows.find(r => within(r).queryByText('ci'))!;
    expect(within(ci).getByText('12')).toBeTruthy();
    expect(within(linked).getByText('–')).toBeTruthy();
  });

  it('the column is translated', async () => {
    await renderPage(serve([{ ...TOKENS[0], usage: usage(3, 9) }]), { language: 'de' });

    await screen.findByText('ci');
    expect(screen.getByRole('columnheader', { name: /Anfragen heute/ })).toBeTruthy();
    fireEvent.focus(screen.getByText('3'));
    expect((await screen.findByRole('tooltip')).textContent).toBe('Letzte 30 Tage: 9');
  });
});

describe('tokens messages', () => {
  it('translate every English text in the 10 other languages', () => {
    const en = Object.keys(messages.tokens.en);
    const base = (key: string) => key.replace(/_(zero|one|two|few|many|other)$/, '');
    for (const { code } of LOCALES.filter(l => l.code !== 'en')) {
      const own = messages.tokens[code as Exclude<typeof code, 'en'>] ?? {};
      const missing = en.filter(key => !(key in own) && !(base(key) !== key && `${base(key)}_other` in own));
      expect({ code, missing }).toEqual({ code, missing: [] });
    }
  });
});

describe('TokensPage loading and failures', () => {
  it('shows a table skeleton until the tokens arrive', async () => {
    let answer!: (r: Response) => void;
    await renderPage(async url => (String(url).startsWith(PERMISSIONS) ? json([]) : new Promise<Response>(r => { answer = r; })));

    const skeleton = screen.getByText('Loading tokens…').closest('[role=status]')!;
    expect(skeleton.querySelectorAll(':scope > div')).toHaveLength(5);
    answer(json(TOKENS));
    expect(await screen.findByText('Qodalis CLI on Pixel 7')).toBeTruthy();
    expect(screen.queryByText('Loading tokens…')).toBeNull();
  });

  it('shows a failed list with Retry, and Retry loads it', async () => {
    let fail = true;
    await renderPage(async url => {
      if (String(url).startsWith(PERMISSIONS)) return json([]);
      return fail ? json({ error: 'token store offline' }, 500) : json(TOKENS);
    });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('token store offline');
    fail = false;
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Qodalis CLI on Pixel 7')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says so when there are no tokens', async () => {
    await renderPage(async () => json([]));
    expect(await screen.findByText('There are no API tokens.')).toBeTruthy();
  });
});
