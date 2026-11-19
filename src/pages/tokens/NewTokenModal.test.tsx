// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import NewTokenModal from './NewTokenModal';
import { I18nProvider } from '../../i18n';
import { LOCALES } from '../../i18n/locales';
import tokenMessages from '../../i18n/messages/tokens';
import type { CliPermission } from '../../api/permissions';

const CATALOG = [
  { name: 'files:read', description: 'List, read and download files', group: 'Files', surface: 'cli' },
  { name: 'files:write', description: 'Upload, create and delete files', group: 'Files', surface: 'cli' },
  { name: 'jobs:read', description: 'See jobs and their runs', group: 'Jobs', surface: 'cli' },
  { name: 'rates:read', description: 'Official exchange rates', group: 'Rates', surface: 'host' },
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Stubs the server: `/permissions` answers the catalog (or `permissionsStatus`), `POST /tokens` records its body. */
function stubServer(permissionsStatus = 200, catalog: unknown[] = CATALOG) {
  const posted: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('/api/v1/qcli/permissions')) {
      return permissionsStatus === 200 ? json(catalog) : json({ error: 'Not Found' }, permissionsStatus);
    }
    if (url === '/api/v1/qcli/tokens' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { name: string };
      posted.push(body);
      const apiToken = { id: `t${posted.length}`, name: body.name, userId: 'u1', userName: 'root', createdAt: 0, expiresAt: null, lastUsedAt: null, audience: 'cli' };
      return json({ token: 'qcli_pat_secret', apiToken }, 201);
    }
    return json({ error: 'unexpected' }, 500);
  }));
  return posted;
}

function renderModal(catalog?: typeof CATALOG) {
  render(
    <I18nProvider>
      <NewTokenModal open onClose={() => {}} onCreated={() => {}} catalog={catalog as CliPermission[] | undefined} />
    </I18nProvider>,
  );
  return screen.getByRole('dialog', { name: 'New API token' });
}

function createButton(dialog: HTMLElement) {
  return within(dialog).getByRole('button', { name: 'Create' }) as HTMLButtonElement;
}

/** Clicks Create and waits for the token; returns the posted body. */
async function create(posted: unknown[], dialog: HTMLElement) {
  fireEvent.click(createButton(dialog));
  await screen.findByRole('dialog', { name: 'Token created' });
  return posted[posted.length - 1];
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('qcli_admin_locale', 'en');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('NewTokenModal', () => {
  it('creates an unscoped token by default', async () => {
    const posted = stubServer();
    const dialog = renderModal();
    expect((within(dialog).getByRole('radio', { name: 'Everything I can do' }) as HTMLInputElement).checked).toBe(true);
    expect(within(dialog).getByText('The token always has all of your current permissions.')).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'ci' } });
    expect(await create(posted, dialog)).toEqual({ name: 'ci', expiresInDays: 90 });
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/permissions'))).toBe(false);
  });

  it('creates a token with the selected permissions', async () => {
    const posted = stubServer();
    const dialog = renderModal();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'deploy' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Selected' }));

    expect(await within(dialog).findByRole('heading', { name: 'Files' })).toBeTruthy();
    expect(within(dialog).getByRole('heading', { name: 'Jobs' })).toBeTruthy();
    expect(within(dialog).getByRole('heading', { name: 'Rates' })).toBeTruthy();
    expect(within(dialog).getByText('Official exchange rates')).toBeTruthy();

    fireEvent.click(within(dialog).getByLabelText('files:read'));
    fireEvent.click(within(dialog).getByLabelText('rates:read'));
    fireEvent.change(within(dialog).getByLabelText('Other permissions'), { target: { value: 'deploy:run' } });
    expect(await create(posted, dialog)).toEqual({ name: 'deploy', expiresInDays: 90, permissions: ['files:read', 'rates:read', 'deploy:run'] });
  });

  it('picking equals typing', async () => {
    const posted = stubServer();
    let dialog = renderModal();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'ci' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Selected' }));
    fireEvent.click(await within(dialog).findByLabelText('jobs:read'));
    fireEvent.click(within(dialog).getByLabelText('files:read'));
    const picked = await create(posted, dialog);
    cleanup();

    dialog = renderModal();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'ci' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Selected' }));
    await within(dialog).findByLabelText('files:read');
    fireEvent.change(within(dialog).getByLabelText('Other permissions'), { target: { value: 'files:read jobs:read' } });
    const typed = await create(posted, dialog);

    expect(picked).toEqual({ name: 'ci', expiresInDays: 90, permissions: ['files:read', 'jobs:read'] });
    expect(typed).toEqual(picked);
  });

  it('Selected with nothing chosen disables Create', async () => {
    stubServer();
    const dialog = renderModal();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'ci' } });
    expect(createButton(dialog).disabled).toBe(false);
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Selected' }));
    await within(dialog).findByLabelText('files:read');

    expect(createButton(dialog).disabled).toBe(true);
    const none = within(dialog).getByText('Select at least one permission, or choose Everything I can do.');
    expect(none.id).toBeTruthy();
    expect(within(dialog).getByRole('group', { name: 'Permissions' }).getAttribute('aria-describedby')).toContain(none.id);
    fireEvent.click(within(dialog).getByLabelText('files:read'));
    expect(createButton(dialog).disabled).toBe(false);
    fireEvent.click(within(dialog).getByLabelText('files:read'));
    expect(createButton(dialog).disabled).toBe(true);
  });

  it('falls back to the other field when /permissions fails', async () => {
    const posted = stubServer(404);
    const dialog = renderModal();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'ci' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Selected' }));

    expect(await within(dialog).findByText('This server does not list its permissions; type them below.')).toBeTruthy();
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
    fireEvent.change(within(dialog).getByLabelText('Other permissions'), { target: { value: 'commands:execute, files:read' } });
    expect(await create(posted, dialog)).toEqual({ name: 'ci', expiresInDays: 90, permissions: ['commands:execute', 'files:read'] });
  });

  it('uses the page’s catalog instead of fetching it again', async () => {
    stubServer();
    const dialog = renderModal(CATALOG.slice(0, 1));
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Selected' }));
    expect(within(dialog).getByLabelText('files:read')).toBeTruthy();
    expect(within(dialog).queryByLabelText('jobs:read')).toBeNull();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('explains an empty list and keeps the other field', async () => {
    const posted = stubServer(200, []);
    const dialog = renderModal();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'ci' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Selected' }));

    expect(await within(dialog).findByText('This server lists no permissions for your account; type them below.')).toBeTruthy();
    expect(within(dialog).queryByText('This server does not list its permissions; type them below.')).toBeNull();
    fireEvent.change(within(dialog).getByLabelText('Other permissions'), { target: { value: 'deploy:run' } });
    expect(await create(posted, dialog)).toEqual({ name: 'ci', expiresInDays: 90, permissions: ['deploy:run'] });
  });

  it('has the new texts in every language', () => {
    const keys = [
      'scopeLabel', 'scopeAll', 'scopeAllHint', 'scopeSelected', 'otherPermissions', 'otherHint',
      'catalogUnavailable', 'catalogEmpty', 'noneSelected', 'hostToken', 'hostTokenHint',
    ] as const;
    const sentences = ['scopeAllHint', 'otherHint', 'catalogUnavailable', 'catalogEmpty', 'noneSelected', 'hostTokenHint'] as const;
    const en = tokenMessages.en as Record<string, string>;
    for (const { code } of LOCALES) {
      const messages = tokenMessages[code] as Partial<Record<string, string>> | undefined;
      for (const key of keys) expect(messages?.[key], `${code}.${key}`).toBeTruthy();
      if (code !== 'en') for (const key of sentences) expect(messages?.[key], `${code}.${key}`).not.toBe(en[key]);
      expect(messages?.permissionsOptional, `${code}.permissionsOptional`).toBeUndefined();
      expect(messages?.permissionsHint, `${code}.permissionsHint`).toBeUndefined();
    }
  });
});
