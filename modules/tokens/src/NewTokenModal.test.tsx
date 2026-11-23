// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { LOCALES, defineExtension } from '@qodalis/cli-server-dashboard-kit';
import NewTokenModal from './NewTokenModal';
import { messages } from './messages';
import type { CliPermission } from './api';
import { fakeDashboard, json, mountExtension, type FakeServer } from '@qodalis/cli-server-dashboard-kit/testing';

const tokenMessages = messages.tokens;

const CATALOG = [
  { name: 'files:read', description: 'List, read and download files', group: 'Files', surface: 'cli' },
  { name: 'files:write', description: 'Upload, create and delete files', group: 'Files', surface: 'cli' },
  { name: 'jobs:read', description: 'See jobs and their runs', group: 'Jobs', surface: 'cli' },
  { name: 'rates:read', description: 'Official exchange rates', group: 'Rates', surface: 'host' },
];

let server: FakeServer = () => json({ error: 'unexpected' }, 500);
let dashboard: ReturnType<typeof fakeDashboard>;
let unmount: (() => void) | undefined;

/** The server: `/permissions` answers the catalog (or `permissionsStatus`), `POST /tokens` records its body. */
function stubServer(permissionsStatus = 200, catalog: unknown[] = CATALOG) {
  const posted: unknown[] = [];
  server = (input: string, init?: RequestInit) => {
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
  };
  return posted;
}

async function renderModal(catalog?: typeof CATALOG) {
  unmount?.();
  dashboard = fakeDashboard('tokens', { server: (path, init) => server(path, init) });
  const extension = defineExtension(() => (
    <NewTokenModal open onClose={() => {}} onCreated={() => {}} catalog={catalog as CliPermission[] | undefined} />
  ));
  unmount = await mountExtension(extension, dashboard.context);
  return screen.getByRole('dialog', { name: 'New API token' });
}

const permissionRequests = () => dashboard.state.requests.filter(r => r.path.includes('/permissions'));

function createButton(dialog: HTMLElement) {
  return within(dialog).getByRole('button', { name: 'Create' }) as HTMLButtonElement;
}

/** Clicks Create and waits for the token; returns the posted body. */
async function create(posted: unknown[], dialog: HTMLElement) {
  fireEvent.click(createButton(dialog));
  await screen.findByRole('dialog', { name: 'Token created' });
  return posted[posted.length - 1];
}

afterEach(() => {
  unmount?.();
  unmount = undefined;
  cleanup();
});

describe('NewTokenModal', () => {
  it('creates an unscoped token by default', async () => {
    const posted = stubServer();
    const dialog = await renderModal();
    expect((within(dialog).getByRole('radio', { name: 'Everything I can do' }) as HTMLInputElement).checked).toBe(true);
    expect(within(dialog).getByText('The token always has all of your current permissions.')).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'ci' } });
    expect(await create(posted, dialog)).toEqual({ name: 'ci', expiresInDays: 90 });
    expect(permissionRequests()).toHaveLength(0);
  });

  it('creates a token with the selected permissions', async () => {
    const posted = stubServer();
    const dialog = await renderModal();
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
    let dialog = await renderModal();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'ci' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Selected' }));
    fireEvent.click(await within(dialog).findByLabelText('jobs:read'));
    fireEvent.click(within(dialog).getByLabelText('files:read'));
    const picked = await create(posted, dialog);
    dialog = await renderModal();
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
    const dialog = await renderModal();
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
    const dialog = await renderModal();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'ci' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Selected' }));

    expect(await within(dialog).findByText('This server does not list its permissions; type them below.')).toBeTruthy();
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
    fireEvent.change(within(dialog).getByLabelText('Other permissions'), { target: { value: 'commands:execute, files:read' } });
    expect(await create(posted, dialog)).toEqual({ name: 'ci', expiresInDays: 90, permissions: ['commands:execute', 'files:read'] });
  });

  it('uses the page’s catalog instead of fetching it again', async () => {
    stubServer();
    const dialog = await renderModal(CATALOG.slice(0, 1));
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Selected' }));
    expect(within(dialog).getByLabelText('files:read')).toBeTruthy();
    expect(within(dialog).queryByLabelText('jobs:read')).toBeNull();
    expect(dashboard.state.requests).toHaveLength(0);
  });

  it('explains an empty list and keeps the other field', async () => {
    const posted = stubServer(200, []);
    const dialog = await renderModal();
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
