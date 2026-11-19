// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import App from './App';
import { PAGES, PORTAL_CONFIG, installPortalFetch, setBase } from './test/fixtures';

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Location />
    </MemoryRouter>,
  );
}

const nav = () => screen.findByRole('navigation', { name: 'Documentation' });

beforeEach(() => {
  setBase('/');
  localStorage.clear();
  document.getElementById('qcli-theme')?.remove();
  delete document.documentElement.dataset.qcliTheme;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('navigation', () => {
  it('docs and api on: navigation has the guide groups in order and an API reference entry', async () => {
    installPortalFetch();
    renderApp('/');

    const sidebar = await nav();
    await within(sidebar).findByRole('link', { name: 'Authentication' });
    const groups = within(sidebar).getAllByRole('heading').map(h => h.textContent);
    expect(groups.slice(0, 2)).toEqual(['Guides', 'Basics']);
    const guides = within(sidebar).getByRole('list', { name: 'Guides' });
    expect(within(guides).getAllByRole('link').map(a => a.textContent)).toEqual(['Limits and quotas', 'Welcome to RateBell API']);
    const basics = within(sidebar).getByRole('list', { name: 'Basics' });
    expect(within(basics).getAllByRole('link').map(a => a.textContent)).toEqual(['Authentication']);
    expect(within(sidebar).getByRole('link', { name: 'API reference' }).getAttribute('href')).toBe('/reference');
  });

  it('docs only: no API entry', async () => {
    installPortalFetch({ config: { ...PORTAL_CONFIG, api: null } });
    renderApp('/');

    const sidebar = await nav();
    await within(sidebar).findByRole('link', { name: 'Authentication' });
    expect(within(sidebar).queryByRole('link', { name: 'API reference' })).toBeNull();
  });

  it('api only: home redirects to /reference', async () => {
    installPortalFetch({ config: { ...PORTAL_CONFIG, docs: null } });
    renderApp('/');

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/reference'));
    expect(within(await nav()).queryByRole('link', { name: 'Authentication' })).toBeNull();
  });

  it('neither: "Nothing published yet"', async () => {
    installPortalFetch({ config: { ...PORTAL_CONFIG, docs: null, api: null } });
    renderApp('/');

    expect(await screen.findByText('Nothing published yet')).toBeTruthy();
  });

  it('home shows the index page when it exists, else the first page', async () => {
    installPortalFetch();
    const first = renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome to RateBell API' })).toBeTruthy();
    expect(await screen.findByText(/help@ratebell\.app/)).toBeTruthy();
    first.unmount();

    installPortalFetch({ pages: PAGES.filter(p => p.slug !== 'index') });
    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Limits and quotas' })).toBeTruthy();
    expect(await screen.findByText('Requests per day.')).toBeTruthy();
  });

  it('unknown route shows Not found', async () => {
    installPortalFetch();
    renderApp('/nowhere/at/all');

    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeTruthy();
  });

  it('a guide link opens the guide', async () => {
    installPortalFetch();
    renderApp('/');

    fireEvent.click(await within(await nav()).findByRole('link', { name: 'Authentication' }));

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/guides/auth'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Authentication' })).toBeTruthy();
  });
});

describe('branding', () => {
  it('name and logo in the header, footer links rendered with their urls', async () => {
    installPortalFetch();
    renderApp('/');

    const header = await screen.findByRole('banner');
    expect(within(header).getByText('RateBell API')).toBeTruthy();
    expect(within(header).getByRole('img', { name: 'RateBell API' }).getAttribute('src')).toBe('/logo.svg');
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('link', { name: 'Terms' }).getAttribute('href')).toBe('https://example.com/terms');
    expect(within(footer).getByRole('link', { name: 'Status' }).getAttribute('href')).toBe('/status');
    await waitFor(() => expect(document.title).toBe('Welcome to RateBell API · RateBell API'));
  });

  it('theme from portal.json is applied (style#qcli-theme contains --qcli-primary)', async () => {
    installPortalFetch();
    renderApp('/');

    await screen.findByRole('banner');
    const css = document.getElementById('qcli-theme')?.textContent ?? '';
    expect(css).toContain('--qcli-primary: #ff5500');
    expect(css).toContain('--qcli-primary: #cc4400');
  });

  it('theme toggle switches data-qcli-theme and survives a throwing localStorage', async () => {
    installPortalFetch({ config: { ...PORTAL_CONFIG, theme: { mode: 'dark', dark: {}, light: {} } } });
    renderApp('/');

    fireEvent.click(await screen.findByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement.dataset.qcliTheme).toBe('light');
    expect(localStorage.getItem('qcli_portal_theme')).toBe('light');

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    fireEvent.click(await screen.findByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement.dataset.qcliTheme).toBe('dark');
  });

  it('the reader\'s saved choice wins over the portal\'s mode', async () => {
    localStorage.setItem('qcli_portal_theme', 'light');
    installPortalFetch({ config: { ...PORTAL_CONFIG, theme: { mode: 'dark', dark: {}, light: {} } } });
    renderApp('/');

    await screen.findByRole('banner');
    expect(document.documentElement.dataset.qcliTheme).toBe('light');
  });
});

describe('errors', () => {
  it('a failed portal.json shows the error state', async () => {
    installPortalFetch({ config: 'error' });
    renderApp('/');

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('The documentation could not be loaded')).toBeTruthy();
    expect(screen.getByText('portal.json: 500')).toBeTruthy();
  });
});
