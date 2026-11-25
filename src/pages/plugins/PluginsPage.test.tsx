// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import PluginsPage from './PluginsPage';
import { I18nProvider } from '../../i18n';

const module = (id: string, name: string, icon?: string | null) =>
  ({ id, name, version: '1.0.0', description: '', enabled: true, processorCount: 1, processors: ['cmd'], ...(icon !== undefined ? { icon } : {}) });

const installed = [
  { id: 'Qodalis.Cli', name: 'Core', version: '1.0.0', description: '', icon: '🖥️' },
  { id: '@qodalis/cli-server-plugin-users', name: 'Users', version: '1.0.0' },
  { id: '@acme/cli-server-plugin-billing', name: 'Billing', icon: null },
  { id: 'Acme.Logo', name: 'Logo', icon: '/logo.png' },
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** The page's fetch: `handler` for the server's plugins; the marketplace endpoints answer like a server without them. */
function stubFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    /\/(dashboard|server)\/marketplace/.test(String(input)) ? Promise.resolve(json({ error: 'Not found' }, 404)) : handler(input, init)));
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('qcli_admin_locale', 'en');
  stubFetch(vi.fn(async (input: RequestInfo | URL) =>
    String(input).endsWith('/installed') ? json(installed) : json([
      module('weather', 'Weather', '🌤'),
      module('jobs', 'Jobs', 'https://cdn.example.com/jobs.svg'),
      module('@qodalis/users', 'users', null),
      module('legacy', 'Legacy'),
    ])));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Location() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

function renderPage() {
  return render(<I18nProvider><MemoryRouter initialEntries={['/plugins']}><PluginsPage /><Location /></MemoryRouter></I18nProvider>);
}

const location = () => screen.getByTestId('location').textContent;

describe('PluginsPage module icons', () => {
  const moduleIcons = () => screen.getAllByTestId('module-icon').slice(installed.length);

  it('shows an emoji, an image, the icon of a known module, or the default', async () => {
    renderPage();
    await screen.findByText('Weather');
    const icons = moduleIcons();
    expect(icons).toHaveLength(4);
    expect(icons[0].textContent).toBe('🌤');
    expect(icons[1].querySelector('img')?.getAttribute('src')).toBe('https://cdn.example.com/jobs.svg');
    expect(icons[2].textContent).toBe('👥');
    expect(icons[3].textContent).toBe('🧩');
    expect(icons.every(i => i.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('shows the fallback when the image fails to load', async () => {
    renderPage();
    await screen.findByText('Jobs');
    fireEvent.error(moduleIcons()[1].querySelector('img')!);
    expect(moduleIcons()[1].textContent).toBe('⏱️');
  });
});

describe('PluginsPage installed plugin icons', () => {
  it("shows the server's icon, the icon of a known package, or the default", async () => {
    renderPage();
    await screen.findByText('Billing');
    const icons = screen.getAllByTestId('module-icon').slice(0, installed.length);
    expect(icons.map(i => i.textContent)).toEqual(['🖥️', '👥', '🧩', '']);
    expect(icons[3].querySelector('img')?.getAttribute('src')).toBe('/logo.png');
  });

  it('shows the default when the image fails to load', async () => {
    renderPage();
    await screen.findByText('Logo');
    fireEvent.error(screen.getAllByTestId('module-icon')[3].querySelector('img')!);
    expect(screen.getAllByTestId('module-icon')[3].textContent).toBe('🧩');
  });
});

describe('PluginsPage loading, errors and toggles', () => {
  it('shows card skeletons for both sections until the plugins arrive', async () => {
    const answers: Array<() => void> = [];
    stubFetch(vi.fn((input: RequestInfo | URL) => new Promise<Response>(resolve => {
      answers.push(() => resolve(String(input).endsWith('/installed') ? json(installed) : json([module('weather', 'Weather', '🌤')])));
    })));
    renderPage();

    const statuses = screen.getAllByRole('status');
    expect(statuses).toHaveLength(2);
    expect(statuses.map(s => s.textContent)).toEqual(['Loading…', 'Loading plugins…']);
    expect(statuses[1].querySelectorAll('.rounded-xl')).toHaveLength(6);

    answers.forEach(answer => answer());
    expect(await screen.findByText('Weather')).toBeTruthy();
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });

  it('shows a failure with Retry, and Retry loads the modules', async () => {
    let fail = true;
    stubFetch(vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/installed')) return json([]);
      return fail ? json({ error: 'modules unavailable' }, 500) : json([module('weather', 'Weather', '🌤')]);
    }));
    renderPage();

    expect((await screen.findByRole('alert')).textContent).toContain('modules unavailable');
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Weather')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says so when there are no plugins', async () => {
    stubFetch(vi.fn(async () => json([])));
    renderPage();
    expect(await screen.findByText('No plugins installed.')).toBeTruthy();
  });

  it('reports a toggle the server refuses and keeps the page usable', async () => {
    const calls: string[] = [];
    stubFetch(vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/toggle')) return json({ error: 'core modules cannot be disabled' }, 400);
      return url.endsWith('/installed') ? json([]) : json([module('weather', 'Weather', '🌤')]);
    }));
    renderPage();
    await screen.findByText('Weather');

    fireEvent.click(screen.getByTitle('Disable plugin'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Could not change Weather: core modules cannot be disabled');
    expect(calls).toContain('POST /api/v1/qcli/plugins/weather/toggle');
    // The list is reloaded quietly: the cards stay
    expect(screen.getByText('Weather')).toBeTruthy();
    expect((screen.getByTitle('Disable plugin') as HTMLButtonElement).disabled).toBe(false);
  });

  it('reloads the modules after a toggle without an error', async () => {
    let enabled = true;
    stubFetch(vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/toggle')) { enabled = !enabled; return json({ id: 'weather', enabled }); }
      return url.endsWith('/installed') ? json([]) : json([{ ...module('weather', 'Weather', '🌤'), enabled }]);
    }));
    renderPage();
    await screen.findByText('Weather');

    fireEvent.click(screen.getByTitle('Disable plugin'));
    expect(await screen.findByTitle('Enable plugin')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('PluginsPage cards open the details page', () => {
  it('links every module card and package card to its details page', async () => {
    renderPage();
    const weather = (await screen.findByText('Weather')).closest('a')!;
    expect(weather.getAttribute('href')).toBe('/plugins/weather');
    expect(screen.getByText('Jobs').closest('a')!.getAttribute('href')).toBe('/plugins/jobs');
    expect(screen.getByText('Billing').closest('a')!.getAttribute('href')).toBe('/plugins/%40acme%2Fcli-server-plugin-billing');

    fireEvent.click(weather);
    expect(location()).toBe('/plugins/weather');
  });

  it('opens an installed package from its card', async () => {
    renderPage();
    fireEvent.click((await screen.findByText('Users')).closest('a')!);
    expect(location()).toBe('/plugins/%40qodalis%2Fcli-server-plugin-users');
  });

  it('keeps the toggle outside the link: toggling never opens the page', async () => {
    let enabled = true;
    stubFetch(vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/toggle')) { enabled = !enabled; return json({ id: 'weather', enabled }); }
      return url.endsWith('/installed') ? json([]) : json([{ ...module('weather', 'Weather', '🌤'), enabled }]);
    }));
    renderPage();
    const toggle = await screen.findByRole('switch', { name: 'Disable plugin' });
    expect(toggle.closest('a')).toBeNull();

    fireEvent.click(toggle);
    expect(await screen.findByRole('switch', { name: 'Enable plugin' })).toBeTruthy();
    expect(location()).toBe('/plugins');
  });

  it('leaves a middle click or a modified click to the browser (new tab)', async () => {
    renderPage();
    const weather = (await screen.findByText('Weather')).closest('a')!;
    // After the router has seen the click: stops jsdom's own navigation, which it does not implement
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener('click', stop);
    fireEvent.click(weather, { button: 1 });
    fireEvent.click(weather, { ctrlKey: true });
    document.removeEventListener('click', stop);
    expect(location()).toBe('/plugins');
  });

  it('reaches the cards and the toggles by keyboard, with a focus ring', async () => {
    renderPage();
    const weather = (await screen.findByText('Weather')).closest('a')!;
    weather.focus();
    expect(document.activeElement).toBe(weather);
    expect(weather.className).toContain('focus-visible:ring-2');
    expect(weather.className).toContain('hover:border-primary/50');

    const toggle = screen.getAllByRole('switch')[0];
    expect(toggle.tagName).toBe('BUTTON');
    toggle.focus();
    expect(document.activeElement).toBe(toggle);

    // A link activated with Enter is clicked by the browser
    weather.focus();
    fireEvent.click(document.activeElement!);
    expect(location()).toBe('/plugins/weather');
  });
});
