// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import ConfigPage from './ConfigPage';
import { registerConfigEditor, type ConfigEditorProps } from './configEditors';
import { I18nProvider } from '../../i18n';
import { WebSocketProvider } from '../../context/WebSocketContext';
import { setToken } from '../../api/client';
import { FakeWebSocket, json } from '../../test/fakes';
import type { ConfigEntry, ConfigProvider } from '../../types';

function entry(patch: Partial<ConfigEntry> & { key: string }): ConfigEntry {
  return {
    label: patch.key, description: '', type: 'string', value: null, default: null, source: 'default',
    mutable: true, requiresRestart: false, sensitive: false, ...patch,
  };
}

function providers(): ConfigProvider[] {
  return [
    {
      id: 'server', title: 'Server', description: 'Runtime information', order: 1, writable: false,
      sections: [{
        id: 'runtime', title: 'Runtime', description: '', mutable: false, version: null, allowCustomKeys: false,
        entries: [
          entry({ key: 'version', label: 'Version', value: '1.2.3', mutable: false, source: 'runtime' }),
          entry({ key: 'jwt', label: 'JWT secret', type: 'secret', sensitive: true, isSet: true, mutable: false }),
        ],
      }],
    },
    {
      id: 'demo', title: 'Demo app', description: 'The demo host settings', order: 0, writable: true,
      sections: [{
        id: 'greeting', title: 'Greeting', description: 'What the demo says', mutable: true, version: '1', allowCustomKeys: false,
        entries: [
          entry({ key: 'text', label: 'Greeting text', description: 'Shown at sign-in', value: 'Hello', default: 'Hello', validation: { required: true, max: 10 } }),
          entry({ key: 'apiKey', label: 'Partner API key', type: 'secret', sensitive: true, isSet: true }),
          entry({ key: 'port', label: 'Port', type: 'number', value: 8080, default: 8047, source: 'environment', requiresRestart: true, validation: { min: 1, max: 65535 } }),
          entry({ key: 'enabled', label: 'Enabled', type: 'boolean', value: false, default: false }),
          entry({ key: 'level', label: 'Log level', type: 'enum', value: 'info', default: 'info', validation: { options: ['debug', 'info', 'warn'] } }),
          entry({ key: 'origins', label: 'Allowed origins', type: 'string[]', value: ['https://a.test'], default: [], validation: { pattern: '^https?://' } }),
          entry({ key: 'meta', label: 'Metadata', type: 'json', value: { a: 1 }, default: {} }),
          entry({ key: 'timeout', label: 'Timeout', type: 'duration', value: '30s', default: '30s', validation: { min: 1000 } }),
          entry({ key: 'site', label: 'Site URL', type: 'url', value: '', default: '' }),
          entry({ key: 'schedule', label: 'Schedule', editor: 'cron', value: '0 * * * *', default: '0 * * * *' }),
          entry({ key: 'locked', label: 'Locked', value: 'fixed', default: 'fixed', mutable: false, source: 'file' }),
        ],
      }],
    },
    {
      id: 'custom', title: 'Custom', description: '', order: 2, writable: true,
      sections: [{
        id: 'custom', title: 'Custom settings', description: '', mutable: true, version: '4', allowCustomKeys: true,
        entries: [entry({ key: 'theme', value: 'dark', default: null, source: 'database' })],
      }],
    },
  ];
}

interface Patch {
  url: string;
  body: { changes: Record<string, unknown>; version?: string };
}

let config: () => Response | Promise<Response>;
let patch: (p: Patch) => Response | Promise<Response>;
let patches: Patch[];
let gets: number;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('qcli_admin_locale', 'en');
  setToken('good-token');
  FakeWebSocket.install();
  patches = [];
  gets = 0;
  config = () => json({ providers: providers() });
  patch = p => json({ provider: 'demo', applied: Object.keys(p.body.changes), requiresRestart: false, version: '2' });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/v1/qcli/config' && (!init?.method || init.method === 'GET')) {
      gets++;
      return config();
    }
    if (url.startsWith('/api/v1/qcli/config/') && init?.method === 'PATCH') {
      const p = { url, body: JSON.parse(String(init.body)) };
      patches.push(p);
      return patch(p);
    }
    return json({ error: 'not found' }, 404);
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const last = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

async function mount(path = '/config', heading = 'Greeting') {
  render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <WebSocketProvider><ConfigPage /></WebSocketProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
  await screen.findByRole('heading', { name: heading });
}

async function connect() {
  await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0));
  await act(async () => { last().open(); });
  return (event: Record<string, unknown>) => act(async () => { last().emit(event); });
}

const row = (key: string) => document.querySelector(`[data-config-key="${key}"]`) as HTMLElement;
const saveButton = () => screen.getByRole('button', { name: /^Save/ });
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function openDiff() {
  fireEvent.click(saveButton());
  return screen.findByRole('dialog');
}

async function confirmSave() {
  const dialog = await openDiff();
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })); });
}

describe('ConfigPage loading', () => {
  it('shows a skeleton until the providers arrive', async () => {
    let answer!: (r: Response) => void;
    config = () => new Promise<Response>(r => { answer = r; });
    render(<I18nProvider><MemoryRouter><ConfigPage /></MemoryRouter></I18nProvider>);
    expect(screen.getByText('Loading configuration…')).toBeTruthy();
    await act(async () => { answer(json({ providers: providers() })); });
    expect(await screen.findByRole('heading', { name: 'Greeting' })).toBeTruthy();
    expect(screen.queryByText('Loading configuration…')).toBeNull();
  });

  it('shows the failure with Retry, which loads again', async () => {
    config = () => json({ error: 'database is down' }, 500);
    render(<I18nProvider><MemoryRouter><ConfigPage /></MemoryRouter></I18nProvider>);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Could not load the configuration');
    expect(alert.textContent).toContain('database is down');
    config = () => json({ providers: providers() });
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Greeting' })).toBeTruthy();
  });

  it('says so when the server has no providers', async () => {
    config = () => json({ providers: [] });
    render(<I18nProvider><MemoryRouter><ConfigPage /></MemoryRouter></I18nProvider>);
    expect(await screen.findByText('This server has no configuration providers.')).toBeTruthy();
  });
});

describe('ConfigPage providers and search', () => {
  it('lists the providers by order and opens the first; another one on click, kept in the URL', async () => {
    await mount();
    const nav = screen.getByRole('navigation', { name: 'Configuration providers' });
    expect(within(nav).getAllByRole('button').map(b => b.textContent)).toEqual(['Demo app', 'Server(Read-only)', 'Custom']);
    expect(within(nav).getByRole('button', { name: 'Demo app' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(within(nav).getByRole('button', { name: /Server/ }));
    expect(await screen.findByRole('heading', { name: 'Runtime' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Greeting' })).toBeNull();
  });

  it('opens the provider named in the URL', async () => {
    render(
      <I18nProvider><MemoryRouter initialEntries={['/config?provider=custom']}><ConfigPage /></MemoryRouter></I18nProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Custom settings' })).toBeTruthy();
  });

  it('searches keys, labels and descriptions across every provider', async () => {
    await mount();
    fireEvent.change(screen.getByLabelText('Search settings'), { target: { value: 'version' } });
    expect(screen.getByRole('heading', { name: 'Runtime' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Greeting' })).toBeNull();
    expect(row('version')).toBeTruthy();
    expect(row('jwt')).toBeNull();

    fireEvent.change(screen.getByLabelText('Search settings'), { target: { value: 'sign-in' } });
    expect(row('text')).toBeTruthy();
    expect(row('port')).toBeNull();

    fireEvent.change(screen.getByLabelText('Search settings'), { target: { value: 'nothing-like-this' } });
    expect(screen.getByText('No settings match the search.')).toBeTruthy();
  });
});

describe('ConfigPage read-only rendering and badges', () => {
  it('shows read-only values as text, secrets only as set, with their badges', async () => {
    await mount('/config?provider=server', 'Runtime');
    expect(within(row('version')).queryByRole('textbox')).toBeNull();
    expect(within(row('version')).getByText('1.2.3')).toBeTruthy();
    expect(within(row('version')).getByText('Runtime')).toBeTruthy();
    expect(within(row('version')).getByText('Read-only')).toBeTruthy();
    expect(within(row('jwt')).getByText('Set')).toBeTruthy();
    expect(within(row('jwt')).queryByRole('button')).toBeNull();
    expect(row('jwt').textContent).not.toContain('Replace');
    expect(screen.getAllByText('Read-only').length).toBeGreaterThan(2); // the section's badge too
  });

  it('shows source, restart and read-only badges on a writable provider', async () => {
    await mount();
    expect(within(row('port')).getByText('Environment')).toBeTruthy();
    expect(within(row('port')).getByText('Restart required')).toBeTruthy();
    expect(within(row('locked')).getByText('File')).toBeTruthy();
    expect(within(row('locked')).getByText('Read-only')).toBeTruthy();
    expect(within(row('locked')).queryByRole('textbox')).toBeNull();
    expect(within(row('apiKey')).getByText('Set')).toBeTruthy();
  });
});

describe('ConfigPage inputs by type', () => {
  it('string: required and max length are checked while typing and block saving', async () => {
    await mount();
    type('Greeting text', '');
    expect(within(row('text')).getByRole('alert').textContent).toContain('Required');
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);
    type('Greeting text', 'Far too long text');
    expect(within(row('text')).getByRole('alert').textContent).toContain('At most 10 characters');
    type('Greeting text', 'Hi');
    expect(within(row('text')).queryByRole('alert')).toBeNull();
    expect(saveButton().textContent).toContain('Save (1)');
  });

  it('number: min and max on the input and checked; text that is no number is an error', async () => {
    await mount();
    const input = screen.getByLabelText('Port') as HTMLInputElement;
    expect(input.type).toBe('number');
    expect(input.min).toBe('1');
    expect(input.max).toBe('65535');
    type('Port', '70000');
    expect(within(row('port')).getByRole('alert').textContent).toContain('At most 65,535');
    type('Port', '0');
    expect(within(row('port')).getByRole('alert').textContent).toContain('At least 1');
    type('Port', '');
    expect(within(row('port')).getByRole('alert').textContent).toContain('Must be a number');
    type('Port', '9000');
    expect(within(row('port')).queryByRole('alert')).toBeNull();
  });

  it('boolean: a switch', async () => {
    await mount();
    const toggle = screen.getByRole('switch', { name: 'Enabled' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(within(row('enabled')).getByText('Modified')).toBeTruthy();
    fireEvent.click(toggle);
    expect(within(row('enabled')).queryByText('Modified')).toBeNull();
  });

  it('enum: a select of the options', async () => {
    await mount();
    const select = screen.getByRole('combobox', { name: 'Log level' });
    fireEvent.click(select);
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(['debug', 'info', 'warn']);
    fireEvent.click(screen.getByRole('option', { name: 'debug' }));
    expect(select.textContent).toContain('debug');
    expect(saveButton().textContent).toContain('Save (1)');
  });

  it('string[]: tags added with Enter, removed with ×, each checked against the pattern', async () => {
    await mount();
    const input = screen.getByLabelText('Allowed origins');
    fireEvent.change(input, { target: { value: 'https://b.test' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(within(row('origins')).getByText('https://b.test')).toBeTruthy();
    fireEvent.change(input, { target: { value: 'ftp://c' } });
    fireEvent.keyDown(input, { key: ',' });
    expect(within(row('origins')).getByRole('alert').textContent).toContain("'ftp://c' must match ^https?://");
    fireEvent.click(within(row('origins')).getByRole('button', { name: 'Remove ftp://c' }));
    expect(within(row('origins')).queryByRole('alert')).toBeNull();
    expect(saveButton().textContent).toContain('Save (1)');
  });

  it('json: a textarea whose text must parse', async () => {
    await mount();
    const area = screen.getByLabelText('Metadata') as HTMLTextAreaElement;
    expect(area.tagName).toBe('TEXTAREA');
    expect(area.value).toBe('{\n  "a": 1\n}');
    type('Metadata', '{"a": ');
    expect(within(row('meta')).getByRole('alert').textContent).toContain('Must be valid JSON');
    type('Metadata', '{"a": 2}');
    expect(within(row('meta')).queryByRole('alert')).toBeNull();
  });

  it('duration: units and the minimum are checked', async () => {
    await mount();
    type('Timeout', '10 minutes');
    expect(within(row('timeout')).getByRole('alert').textContent).toContain('Must be a duration such as 500ms');
    type('Timeout', '500ms');
    expect(within(row('timeout')).getByRole('alert').textContent).toContain('At least 1s');
    type('Timeout', '15m');
    expect(within(row('timeout')).queryByRole('alert')).toBeNull();
  });

  it('string with the textarea or code hint: a multi-line text', async () => {
    config = () => {
      const p = providers();
      p[1].sections[0].entries.push(entry({ key: 'notes', label: 'Notes', editor: 'textarea', value: 'a\nb' }));
      return json({ providers: p });
    };
    await mount();
    const area = screen.getByLabelText('Notes') as HTMLTextAreaElement;
    expect(area.tagName).toBe('TEXTAREA');
    expect(area.value).toBe('a\nb');
  });

  it('url: must be absolute', async () => {
    await mount();
    expect((screen.getByLabelText('Site URL') as HTMLInputElement).type).toBe('url');
    type('Site URL', 'example.com');
    expect(within(row('site')).getByRole('alert').textContent).toContain('Must be an absolute URL');
    type('Site URL', 'https://example.com');
    expect(within(row('site')).queryByRole('alert')).toBeNull();
  });
});

describe('ConfigPage saving', () => {
  it('shows a diff of every change, sends one PATCH per section with its version, and says it saved', async () => {
    await mount();
    type('Greeting text', 'Hi');
    type('Port', '9000');
    fireEvent.click(screen.getByRole('switch', { name: 'Enabled' }));
    const dialog = await openDiff();
    expect(within(dialog).getByText('Demo app › Greeting')).toBeTruthy();
    const text = dialog.querySelector('[data-diff-key="text"]')!;
    expect(text.textContent).toContain('Hello');
    expect(text.textContent).toContain('Hi');
    const port = dialog.querySelector('[data-diff-key="port"]')!;
    expect(port.textContent).toContain('8080');
    expect(port.textContent).toContain('9000');
    expect(port.textContent).toContain('*');
    expect(dialog.querySelector('[data-diff-key="enabled"]')!.textContent).toContain('true');
    expect(within(dialog).getByText(/\* Restart required/)).toBeTruthy();
    expect(patches).toEqual([]);

    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })); });
    expect(patches).toEqual([{ url: '/api/v1/qcli/config/demo/greeting', body: { changes: { text: 'Hi', port: 9000, enabled: true }, version: '1' } }]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('Saved')).toBeTruthy();
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it('cancelling the diff sends nothing and keeps the edits', async () => {
    await mount();
    type('Greeting text', 'Hi');
    const dialog = await openDiff();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(patches).toEqual([]);
    expect((screen.getByLabelText('Greeting text') as HTMLInputElement).value).toBe('Hi');
  });

  it('says a restart is needed when the server says so', async () => {
    patch = () => json({ provider: 'demo', applied: ['port'], requiresRestart: true, version: '2' });
    await mount();
    type('Port', '9000');
    await confirmSave();
    expect(await screen.findByText('Saved. Some changes take effect after the server restarts.')).toBeTruthy();
  });

  it('shows the server per-key errors (400) under their inputs, cleared once edited', async () => {
    patch = () => json({ error: 'validation failed', errors: { text: 'is not allowed here', port: 'is in use' } }, 400);
    await mount();
    type('Greeting text', 'Hi');
    type('Port', '9000');
    await confirmSave();
    expect((await within(row('text')).findByRole('alert')).textContent).toContain('is not allowed here');
    expect(within(row('port')).getByRole('alert').textContent).toContain('is in use');
    expect((screen.getByLabelText('Greeting text') as HTMLInputElement).value).toBe('Hi');
    type('Greeting text', 'Hey');
    expect(within(row('text')).queryByRole('alert')).toBeNull();
    expect(within(row('port')).getByRole('alert').textContent).toContain('is in use');
  });

  it('shows another failure (403) with the server message', async () => {
    patch = () => json({ error: 'missing permission config:write' }, 403);
    await mount();
    type('Greeting text', 'Hi');
    await confirmSave();
    const alert = await screen.findByText(/missing permission config:write/);
    expect(alert).toBeTruthy();
  });

  it('on a version conflict (409) offers Reload, which drops the edits and reads the server again', async () => {
    patch = () => json({ error: 'version conflict', version: '5' }, 409);
    await mount();
    type('Greeting text', 'Hi');
    await confirmSave();
    const conflict = await screen.findByText(/Someone saved this section first/);
    expect(conflict).toBeTruthy();
    expect((screen.getByLabelText('Greeting text') as HTMLInputElement).value).toBe('Hi');
    const getsBefore = gets;
    config = () => {
      const p = providers();
      p[1].sections[0].version = '5';
      p[1].sections[0].entries[0].value = 'Hello there';
      return json({ providers: p });
    };
    fireEvent.click(within(conflict.parentElement!).getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect((screen.getByLabelText('Greeting text') as HTMLInputElement).value).toBe('Hello there'));
    expect(gets).toBe(getsBefore + 1);
    expect(screen.queryByText(/Someone saved this section first/)).toBeNull();
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it('Discard drops every edit', async () => {
    await mount();
    type('Greeting text', 'Hi');
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect((screen.getByLabelText('Greeting text') as HTMLInputElement).value).toBe('Hello');
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('ConfigPage secrets', () => {
  it('Replace types a new secret, sent as is and shown only as replaced in the diff', async () => {
    await mount();
    fireEvent.click(within(row('apiKey')).getByRole('button', { name: 'Replace' }));
    const input = screen.getByLabelText('Partner API key') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: 's3cret' } });
    const dialog = await openDiff();
    const diff = dialog.querySelector('[data-diff-key="apiKey"]')!;
    expect(diff.textContent).toContain('replaced');
    expect(diff.textContent).not.toContain('s3cret');
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })); });
    expect(patches[0].body.changes).toEqual({ apiKey: 's3cret' });
  });

  it('Clear sends null; Undo takes it back', async () => {
    await mount();
    fireEvent.click(within(row('apiKey')).getByRole('button', { name: 'Clear' }));
    expect(within(row('apiKey')).getByText('Will be cleared')).toBeTruthy();
    fireEvent.click(within(row('apiKey')).getByRole('button', { name: 'Undo' }));
    expect(within(row('apiKey')).queryByText('Will be cleared')).toBeNull();
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(within(row('apiKey')).getByRole('button', { name: 'Clear' }));
    const dialog = await openDiff();
    expect(dialog.querySelector('[data-diff-key="apiKey"]')!.textContent).toContain('cleared');
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })); });
    expect(patches[0].body.changes).toEqual({ apiKey: null });
  });

  it('an unset secret offers Set and no Clear', async () => {
    config = () => {
      const p = providers();
      p[1].sections[0].entries[1].isSet = false;
      return json({ providers: p });
    };
    await mount();
    expect(within(row('apiKey')).getByText('Not set', { selector: 'span.rounded-full' })).toBeTruthy();
    expect(within(row('apiKey')).getByRole('button', { name: 'Set' })).toBeTruthy();
    expect(within(row('apiKey')).queryByRole('button', { name: 'Clear' })).toBeNull();
  });
});

describe('ConfigPage reset to default', () => {
  it('resets a changed value to its default (null), shown in the diff', async () => {
    await mount();
    expect(within(row('text')).queryByRole('button', { name: 'Reset to default' })).toBeNull(); // already the default
    fireEvent.click(within(row('port')).getByRole('button', { name: 'Reset to default' }));
    expect(within(row('port')).getByText('Resets to the default: 8047')).toBeTruthy();
    const dialog = await openDiff();
    expect(dialog.querySelector('[data-diff-key="port"]')!.textContent).toContain('8047 (default)');
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })); });
    expect(patches[0].body.changes).toEqual({ port: null });
  });

  it('Undo of a reset keeps the value', async () => {
    await mount();
    fireEvent.click(within(row('port')).getByRole('button', { name: 'Reset to default' }));
    fireEvent.click(within(row('port')).getByRole('button', { name: 'Undo' }));
    expect((screen.getByLabelText('Port') as HTMLInputElement).value).toBe('8080');
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('ConfigPage free keys', () => {
  it('adds a key to a section that allows them, and removes one', async () => {
    await mount('/config?provider=custom', 'Custom settings');
    fireEvent.change(screen.getByLabelText('Key of the new setting'), { target: { value: 'bad key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText(/Keys use letters/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Key of the new setting'), { target: { value: 'theme' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('theme already exists')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Key of the new setting'), { target: { value: 'max.items' } });
    fireEvent.click(screen.getByRole('combobox', { name: 'Type of the new setting' }));
    fireEvent.click(screen.getByRole('option', { name: 'number' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    type('max.items', '25');
    fireEvent.click(within(row('theme')).getByRole('button', { name: 'Remove' }));
    expect(within(row('theme')).getByText('Will be removed')).toBeTruthy();

    const dialog = await openDiff();
    expect(dialog.querySelector('[data-diff-key="theme"]')!.textContent).toContain('removed');
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })); });
    expect(patches[0]).toEqual({ url: '/api/v1/qcli/config/custom/custom', body: { changes: { 'max.items': 25, theme: null }, version: '4' } });
  });

  it('Undo on a new key takes it away again', async () => {
    await mount('/config?provider=custom', 'Custom settings');
    fireEvent.change(screen.getByLabelText('Key of the new setting'), { target: { value: 'extra' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(row('extra')).toBeTruthy();
    fireEvent.click(within(row('extra')).getByRole('button', { name: 'Undo' }));
    expect(row('extra')).toBeNull();
  });

  it('offers no new keys where the section does not allow them', async () => {
    await mount();
    expect(screen.queryByLabelText('Key of the new setting')).toBeNull();
  });
});

describe('ConfigPage live refresh', () => {
  it('reads the server again on config:changed when nothing is being edited', async () => {
    await mount();
    const emit = await connect();
    config = () => {
      const p = providers();
      p[1].sections[0].entries[0].value = 'Changed elsewhere';
      return json({ providers: p });
    };
    await emit({ type: 'config:changed', provider: 'demo', section: 'greeting', keys: ['text'], version: '2', requiresRestart: false, user: 'bob' });
    await waitFor(() => expect((screen.getByLabelText('Greeting text') as HTMLInputElement).value).toBe('Changed elsewhere'));
    expect(screen.queryByText(/Changed on the server/)).toBeNull();
  });

  it('keeps unsaved edits and says the section changed, with Reload', async () => {
    await mount();
    const emit = await connect();
    type('Greeting text', 'Mine');
    const getsBefore = gets;
    await emit({ type: 'config:changed', provider: 'demo', section: 'greeting', keys: ['text'], version: '2', requiresRestart: false, user: 'bob' });
    const notice = await screen.findByText(/Changed on the server since you started editing/);
    expect(gets).toBe(getsBefore);
    expect((screen.getByLabelText('Greeting text') as HTMLInputElement).value).toBe('Mine');

    config = () => {
      const p = providers();
      p[1].sections[0].entries[0].value = 'Theirs';
      return json({ providers: p });
    };
    fireEvent.click(within(notice.parentElement!).getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect((screen.getByLabelText('Greeting text') as HTMLInputElement).value).toBe('Theirs'));
    expect(screen.queryByText(/Changed on the server/)).toBeNull();
  });

  it('a change of another section with edits elsewhere refreshes quietly and keeps the edits', async () => {
    await mount();
    const emit = await connect();
    type('Greeting text', 'Mine');
    const getsBefore = gets;
    await emit({ type: 'config:changed', provider: 'custom', section: 'custom', keys: ['theme'], version: '5', requiresRestart: false });
    await waitFor(() => expect(gets).toBe(getsBefore + 1));
    expect((screen.getByLabelText('Greeting text') as HTMLInputElement).value).toBe('Mine');
    expect(screen.queryByText(/Changed on the server/)).toBeNull();
  });
});

describe('ConfigPage custom editors', () => {
  it('renders a registered editor for the entry editor hint and saves what it reports', async () => {
    const seen: ConfigEditorProps[] = [];
    function CronEditor(props: ConfigEditorProps) {
      seen.push(props);
      return (
        <button type="button" onClick={() => props.onChange('*/5 * * * *')}>
          cron:{String(props.value)}
        </button>
      );
    }
    const off = registerConfigEditor('cron', CronEditor);
    try {
      await mount();
      expect(within(row('schedule')).getByRole('button', { name: 'cron:0 * * * *' })).toBeTruthy();
      expect(seen[0].entry.key).toBe('schedule');
      expect(seen[0].disabled).toBe(false);
      fireEvent.click(within(row('schedule')).getByRole('button', { name: /^cron:/ }));
      expect(within(row('schedule')).getByRole('button', { name: 'cron:*/5 * * * *' })).toBeTruthy();
      await confirmSave();
      expect(patches[0].body.changes).toEqual({ schedule: '*/5 * * * *' });
    } finally {
      off();
    }
  });

  it('falls back to the type input when no editor is registered for the hint', async () => {
    await mount();
    expect((screen.getByLabelText('Schedule') as HTMLInputElement).value).toBe('0 * * * *');
  });

  it('a failing section shows its error boundary and leaves the others working', async () => {
    const off = registerConfigEditor('cron', () => { throw new Error('editor crashed'); });
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      config = () => {
        const p = providers();
        p[1].sections.push({ id: 'other', title: 'Other', description: '', mutable: true, version: '1', allowCustomKeys: false, entries: [entry({ key: 'name', label: 'Name', value: 'x' })] });
        return json({ providers: p });
      };
      render(<I18nProvider><MemoryRouter><ConfigPage /></MemoryRouter></I18nProvider>);
      expect(await screen.findByRole('heading', { name: 'Other' })).toBeTruthy();
      const failed = screen.getAllByRole('alert').find(a => a.textContent?.includes('editor crashed'))!;
      expect(failed.textContent).toContain('Greeting');
      expect(screen.queryByRole('heading', { name: 'Greeting' })).toBeNull();
      type('Name', 'y');
      expect(saveButton().textContent).toContain('Save (1)');
    } finally {
      quiet.mockRestore();
      off();
    }
  });
});
