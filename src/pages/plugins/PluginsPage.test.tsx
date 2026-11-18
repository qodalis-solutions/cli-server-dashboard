// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
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

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('qcli_admin_locale', 'en');
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) =>
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

function renderPage() {
  return render(<I18nProvider><MemoryRouter><PluginsPage /></MemoryRouter></I18nProvider>);
}

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
