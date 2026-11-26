// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
    // Header and 8 rows of the 5 columns (no usage on this server)
    const rows = table.querySelectorAll(':scope > div');
    expect(rows).toHaveLength(9);
    expect(rows[1].children).toHaveLength(5);

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
      [() => Promise.resolve(json({ error: 'the registry is unavailable' }, 500)), 'the registry is unavailable'],
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


describe('CommandsPage link filter', () => {
  it('opens filtered to the command in ?q= (from a plugin details page)', async () => {
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/commands?q=weather']}>
          <CommandsPage />
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(await screen.findByText('Shows weather information for a location')).toBeTruthy();
    expect(screen.queryByText('Echoes text')).toBeNull();
    expect((screen.getByLabelText('Search commands…') as HTMLInputElement).value).toBe('weather');
  });
});

describe('CommandsPage permissions', () => {
  // As the servers send them: each command's own permissions, left out when there are none
  const AWS = [
    {
      command: 'aws', description: 'AWS cloud resource management', module: 'aws', requiredPermissions: ['aws:read'],
      processors: [
        {
          command: 's3', description: 'S3 buckets and objects',
          processors: [
            { command: 'ls', description: 'List objects' },
            { command: 'rm', description: 'Delete an object', requiredPermissions: ['aws:write'] },
          ],
        },
      ],
    },
    { command: 'http', description: 'HTTP requests from the server', module: 'core', requiredPermissions: ['http:request'] },
    { command: 'echo', description: 'Echoes text' },
  ];

  const renderPage = (url = '/commands') => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/commands') ? json(AWS) : json({ error: 'not found' }, 404)));
    return render(
      <I18nProvider>
        <MemoryRouter initialEntries={[url]}>
          <CommandsPage />
        </MemoryRouter>
      </I18nProvider>,
    );
  };

  const row = (text: string) => screen.getByText(text).closest('tr')!;

  it("shows each command's permissions as badges, and a dash without any", async () => {
    renderPage();

    expect(await screen.findByText('aws:read')).toBeTruthy();
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toContain('Permissions');
    expect(within(row('HTTP requests from the server')).getByText('http:request')).toBeTruthy();
    expect(within(row('Echoes text')).getByLabelText('No permissions').textContent).toBe('—');
    // a sub-command's permission is not shown on its root
    expect(screen.queryByText('aws:write')).toBeNull();
  });

  it("shows the sub-commands' own permissions when expanded, without the parent's", async () => {
    renderPage();

    fireEvent.click(await screen.findByText('AWS cloud resource management'));
    fireEvent.click(screen.getByText('S3 buckets and objects'));

    expect(within(row('Delete an object')).getByText('aws:write')).toBeTruthy();
    expect(within(row('List objects')).getByLabelText('No permissions')).toBeTruthy();
    expect(within(row('S3 buckets and objects')).getByLabelText('No permissions')).toBeTruthy();
    expect(screen.getAllByText('aws:read')).toHaveLength(1);
  });

  it("finds commands by permission, also a sub-command's, and opens the rows down to it", async () => {
    renderPage();
    await screen.findByText('aws:read');

    fireEvent.change(screen.getByLabelText('Search commands…'), { target: { value: 'HTTP:REQ' } });
    expect(screen.getByText('http:request')).toBeTruthy();
    expect(screen.queryByText('AWS cloud resource management')).toBeNull();
    expect(screen.queryByText('Echoes text')).toBeNull();

    fireEvent.change(screen.getByLabelText('Search commands…'), { target: { value: 'aws:write' } });
    expect(screen.getByText('AWS cloud resource management')).toBeTruthy();
    expect(screen.queryByText('HTTP requests from the server')).toBeNull();
    expect(within(row('Delete an object')).getByText('aws:write')).toBeTruthy();
  });

  it('opens on a permission in ?q=', async () => {
    renderPage('/commands?q=aws:write');

    expect(await screen.findByText('aws:write')).toBeTruthy();
    expect(screen.queryByText('Echoes text')).toBeNull();
  });

  it('does not open a row whose own fields match the search', async () => {
    renderPage();
    await screen.findByText('aws:read');

    fireEvent.change(screen.getByLabelText('Search commands…'), { target: { value: 'aws' } });
    expect(screen.getByText('AWS cloud resource management')).toBeTruthy();
    expect(screen.queryByText('S3 buckets and objects')).toBeNull();
  });
});

describe('CommandsPage long lists', () => {
  const LONG = [{
    command: 'aws',
    description: 'Amazon Web Services',
    documentation: 'Talks to AWS.',
    aliases: ['amazon', 'a', 'cloud', 'aw'],
    requiredPermissions: ['aws:read', 'aws:write', 'aws:admin', 'aws:billing', 'aws:iam'],
  }];

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/commands') ? json(LONG) : json({ error: 'not found' }, 404)));
  });

  const renderPage = () => render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/commands']}>
        <CommandsPage />
      </MemoryRouter>
    </I18nProvider>,
  );

  it('shows two permissions and two aliases, the rest in dialogs, without opening the row', async () => {
    renderPage();
    const row = (await screen.findByText('Amazon Web Services')).closest('tr')!;
    const permissions = within(row).getByRole('list', { name: 'Permissions' });
    expect(within(permissions).getAllByRole('listitem').map(li => li.textContent)).toEqual(['aws:read', 'aws:write', '+3 more']);
    fireEvent.click(within(permissions).getByRole('button', { name: '+3 more' }));
    let dialog = screen.getByRole('dialog', { name: 'Permissions of aws' });
    expect(within(dialog).getAllByRole('listitem').map(li => li.textContent)).toEqual(LONG[0].requiredPermissions);
    fireEvent.click(dialog);
    fireEvent.keyDown(document, { key: 'Escape' });
    // The row stayed closed: its documentation is not shown
    expect(screen.queryByText('Talks to AWS.')).toBeNull();

    const aliases = within(row).getByRole('list', { name: 'Aliases' });
    expect(within(aliases).getAllByRole('listitem').map(li => li.textContent)).toEqual(['amazon', 'a', '+2 more']);
    fireEvent.click(within(aliases).getByRole('button', { name: '+2 more' }));
    dialog = screen.getByRole('dialog', { name: 'Aliases of aws' });
    expect(within(dialog).getAllByRole('listitem').map(li => li.textContent)).toEqual(LONG[0].aliases);
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Close' })[0]);
    expect(screen.queryByText('Talks to AWS.')).toBeNull();

    // A click elsewhere on the row still opens it
    fireEvent.click(screen.getByText('Amazon Web Services'));
    expect(screen.getByText('Talks to AWS.')).toBeTruthy();
  });
});
