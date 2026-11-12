// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import PluginsPage from './PluginsPage';
import { I18nProvider } from '../../i18n';

const module = (id: string, name: string, icon?: string | null) =>
  ({ id, name, version: '1.0.0', description: '', enabled: true, processorCount: 1, processors: ['cmd'], ...(icon !== undefined ? { icon } : {}) });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('qcli_admin_locale', 'en');
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) =>
    String(input).endsWith('/installed') ? json([]) : json([
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
  it('shows an emoji, an image, or the initial', async () => {
    renderPage();
    await screen.findByText('Weather');
    const icons = screen.getAllByTestId('module-icon');
    expect(icons).toHaveLength(4);
    expect(icons[0].textContent).toBe('🌤');
    expect(icons[1].querySelector('img')?.getAttribute('src')).toBe('https://cdn.example.com/jobs.svg');
    expect(icons[2].textContent).toBe('U');
    expect(icons[3].textContent).toBe('L');
    expect(icons.every(i => i.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('shows the initial when the image fails to load', async () => {
    renderPage();
    await screen.findByText('Jobs');
    const img = screen.getAllByTestId('module-icon')[1].querySelector('img')!;
    fireEvent.error(img);
    expect(screen.getAllByTestId('module-icon')[1].textContent).toBe('J');
  });
});
