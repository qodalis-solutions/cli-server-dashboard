// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import CommandsPage from './CommandsPage';
import { I18nProvider } from '../../i18n';

const COMMANDS = [
  {
    command: 'weather',
    description: 'Shows weather information for a location',
    module: 'weather',
    icon: '🌤',
    aliases: ['wx'],
    documentation: 'Weather from wttr.in.\n\nThe default is London.',
    examples: [{ command: 'weather London', description: 'Current weather in London' }],
    parameters: [{ name: 'units', description: 'Unit system', type: 'string', required: false, defaultValue: 'metric', allowedValues: ['metric', 'imperial'], examples: ['imperial'] },
      { name: 'city', description: 'City name', type: 'string', required: false, examples: ['Paris', 'New York'] }],
    processors: [{ command: 'forecast', description: 'Shows a 3-day forecast', aliases: ['fc'] }],
  },
  { command: 'echo', description: 'Echoes text', metadata: { module: 'core' } },
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('qcli_admin_locale', 'en');
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) =>
    String(input).endsWith('/commands') ? json(COMMANDS) : json({ error: 'not found' }, 404)));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CommandsPage', () => {
  it('shows aliases, module and the details of a command', async () => {
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/commands']}>
          <CommandsPage />
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(await screen.findByText('wx')).toBeTruthy();
    expect(screen.getByText('core')).toBeTruthy();

    fireEvent.click(screen.getByText('Shows weather information for a location'));
    expect(screen.getByText('The default is London.')).toBeTruthy();
    expect(screen.getByText('weather London')).toBeTruthy();
    expect(screen.getAllByText('imperial').length).toBe(2);
    expect(screen.getByText('Paris')).toBeTruthy();
    expect(screen.getByText('New York')).toBeTruthy();
    expect(screen.getByText('fc')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Search commands…'), { target: { value: 'wx' } });
    expect(screen.queryByText('echo')).toBeNull();
  });

  it('expands a command from the keyboard through its button', async () => {
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/commands']}>
          <CommandsPage />
        </MemoryRouter>
      </I18nProvider>,
    );

    const toggle = (await screen.findByText('weather', { selector: 'span' })).closest('button')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('The default is London.')).toBeTruthy();
    // echo has nothing to expand: no button
    expect(screen.getByText('echo').closest('button')).toBeNull();
  });
});

describe('CommandsPage loading and errors', () => {
  const renderPage = () => render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/commands']}>
        <CommandsPage />
      </MemoryRouter>
    </I18nProvider>,
  );

  it('shows a table skeleton with the table\'s columns until the commands arrive', async () => {
    let answer!: (r: Response) => void;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) =>
      String(input).endsWith('/commands') ? new Promise<Response>(r => { answer = r; }) : Promise.resolve(json({ error: 'not found' }, 404))));
    renderPage();

    const table = screen.getByText('Loading commands…').closest('[role=status]')!;
    // Header and 8 rows of the 4 columns (no usage on this server)
    const rows = table.querySelectorAll(':scope > div');
    expect(rows).toHaveLength(9);
    expect(rows[1].children).toHaveLength(4);

    answer(json(COMMANDS));
    expect(await screen.findByText('wx')).toBeTruthy();
    expect(screen.queryByText('Loading commands…')).toBeNull();
  });

  it('shows the failure with Retry, and Retry loads the commands', async () => {
    let fail = true;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (!String(input).endsWith('/commands')) return json({ error: 'not found' }, 404);
      return fail ? json({ error: 'server exploded' }, 500) : json(COMMANDS);
    }));
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('server exploded');
    expect(screen.queryByRole('table')).toBeNull();

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('wx')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the table while Refresh reloads it', async () => {
    renderPage();
    await screen.findByText('wx');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(screen.getByText('wx')).toBeTruthy();
    expect(screen.queryByText('Loading commands…')).toBeNull();
  });

  it('says when no command matches the search, and when there are none', async () => {
    renderPage();
    await screen.findByText('wx');
    fireEvent.change(screen.getByLabelText('Search commands…'), { target: { value: 'zzz' } });
    expect(screen.getByText('No commands match your search.')).toBeTruthy();
    cleanup();

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/commands') ? json([]) : json({ error: 'not found' }, 404)));
    renderPage();
    expect(await screen.findByText('No commands registered.')).toBeTruthy();
  });

  it("shows the server's message from a JSON body, a plain-text body, or the network error, never raw JSON", async () => {
    for (const [answer, shown] of [
      [() => Promise.resolve(json({ error: 'forbidden: missing permission commands:read' }, 403)), 'forbidden: missing permission commands:read'],
      [() => Promise.resolve(new Response('Bad Gateway', { status: 502 })), 'Bad Gateway'],
      [() => Promise.reject(new TypeError('Failed to fetch')), 'Failed to fetch'],
    ] as const) {
      vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) =>
        String(input).endsWith('/commands') ? answer() : Promise.resolve(json({ error: 'not found' }, 404))));
      renderPage();
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain(shown);
      expect(alert.textContent).not.toContain('{');
      cleanup();
    }
  });
});

