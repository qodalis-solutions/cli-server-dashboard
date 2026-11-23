// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import type { DashboardExtension } from '@qodalis/cli-server-dashboard-kit';
import { cardsOf, ExtensionCard, useModuleAttention, useOverviewModules } from './OverviewExtensions';
import CommandPalette from '../../components/CommandPalette';
import { loadExtension } from '../extension/loadExtension';
import { AuthProvider } from '../../context/AuthContext';
import { ExtensionsProvider } from '../../context/ExtensionsContext';
import { I18nProvider } from '../../i18n';
import { setToken } from '../../api/client';

vi.mock('../extension/loadExtension', async original => ({
  ...(await original<typeof import('../extension/loadExtension')>()),
  loadExtension: vi.fn(),
}));

const JOBS = { id: 'jobs', title: 'Jobs', entry: '/qcli/modules/jobs/extension.js', widgets: ['overview', 'palette'], search: '/?q=' };
const AUDIT = { id: 'audit', title: 'Audit', entry: '/qcli/modules/audit/extension.js', search: '/?q=', permission: 'audit:read' };
const PLAIN = { id: 'plain', title: 'Plain', entry: '/plain.js' };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** A module with a stat card, a full card, two attention items and palette entries. */
const jobsModule: DashboardExtension = {
  mount: () => {},
  overview: {
    cards: [
      { id: 'count', size: 'stat', mount: el => { el.textContent = 'Active jobs 3'; } },
      {
        id: 'runs',
        size: 'full',
        mount: (el, ctx) => {
          const button = document.createElement('button');
          button.textContent = 'Runs chart';
          button.onclick = () => ctx.navigate('/?at=123');
          el.appendChild(button);
        },
      },
    ],
    attention: async () => [
      { id: 'w', level: 'warning', title: 'Slow job', time: '2026-11-23T10:00:00.000Z', path: '/slow' },
      { id: 'e', level: 'error', title: 'Fetch rates', detail: 'Failing: 40%', time: '2026-11-23T09:00:00.000Z', path: '/fetch-rates' },
    ],
  },
  palette: async () => [{ id: 'fetch-rates', label: 'Fetch rates', hint: 'rates · fetch-rates', path: '/fetch-rates' }],
};

let permissions: string[];

beforeEach(() => {
  // jsdom has no layout: the palette scrolls its selection into view
  Element.prototype.scrollIntoView = vi.fn();
  localStorage.clear();
  localStorage.setItem('qcli_admin_locale', 'en');
  setToken('tok');
  permissions = ['*'];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/auth/mode')) return json({ mode: 'password' });
    if (url.endsWith('/auth/me')) return json({ username: 'root', authenticatedAt: '' });
    if (url.endsWith('/dashboard/extensions')) return json({ extensions: [JOBS, AUDIT, PLAIN] });
    if (url.endsWith('/sessions/current')) return json({ user: { id: 'u1', name: 'root' }, permissions });
    return json({ error: 'not found' }, 404);
  }));
  vi.mocked(loadExtension).mockReset();
  vi.mocked(loadExtension).mockImplementation(async entry => {
    if (entry === JOBS.entry) return jobsModule;
    throw new Error(`unexpected load: ${entry}`);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const where = { path: '' };
function LocationProbe() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    where.path = `${pathname}${search}`;
  }, [pathname, search]);
  return null;
}

function Overview() {
  const modules = useOverviewModules();
  const { items, collectors } = useModuleAttention(modules);
  return (
    <>
      <div data-testid="stats">
        {cardsOf(modules, 'stat').map(({ module, card }) => <ExtensionCard key={card.id} module={module} card={card} />)}
      </div>
      <div data-testid="panels">
        {cardsOf(modules, 'full').map(({ module, card }) => <ExtensionCard key={card.id} module={module} card={card} />)}
      </div>
      {collectors}
      <ul>
        {items.map(item => <li key={item.id}>{`${item.level}:${item.title}:${item.extension.id}${item.path}`}</li>)}
      </ul>
    </>
  );
}

function renderWith(children: React.ReactNode) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <ExtensionsProvider>
            {children}
            <LocationProbe />
          </ExtensionsProvider>
        </AuthProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('modules on the Overview', () => {
  it("mounts the cards of the modules registered for it, only loading those", async () => {
    renderWith(<Overview />);
    expect(await screen.findByText('Active jobs 3')).toBeTruthy();
    expect(screen.getByTestId('panels').textContent).toContain('Runs chart');
    expect(vi.mocked(loadExtension).mock.calls.map(c => c[0])).toEqual([JOBS.entry]);
  });

  it("opens the module's page from a card", async () => {
    renderWith(<Overview />);
    await screen.findByText('Active jobs 3');
    await act(async () => fireEvent.click(await screen.findByText('Runs chart')));
    expect(where.path).toBe('/x/jobs/?at=123');
  });

  it('lists the attention items, errors first, linking into the module', async () => {
    renderWith(<Overview />);
    await waitFor(() => expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual([
      'error:Fetch rates:jobs/fetch-rates',
      'warning:Slow job:jobs/slow',
    ]));
  });
});

describe('modules in the command palette', () => {
  it("lists a module's entries under its title and offers the modules' searches", async () => {
    permissions = ['jobs:*'];
    renderWith(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    });
    expect(await screen.findByText('Fetch rates')).toBeTruthy();
    expect(screen.getByText('rates · fetch-rates')).toBeTruthy();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'rates' } });
    expect(screen.getByText('Search Jobs for “rates”')).toBeTruthy();
    // Audit needs audit:read, which this user lacks
    expect(screen.queryByText('Search Audit for “rates”')).toBeNull();

    await act(async () => fireEvent.click(screen.getByText('Fetch rates')));
    expect(where.path).toBe('/x/jobs/fetch-rates');
  });
});
