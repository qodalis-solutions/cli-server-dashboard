// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { createApi, defineExtension, useDashboard } from './defineExtension';
import { isMissingApi, serverPluginMarketplaceHref, watchMissingApi, type ServerPluginRequirement } from './serverPluginApi';
import { errorText } from '../components/errorText';
import { fakeDashboard, mountExtension, json } from '../testing';

const EXPRESS_404 = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Error</title></head><body><pre>Cannot GET /api/acme/items</pre></body></html>';
const html = (body: string, status: number) => new Response(body, { status, headers: { 'Content-Type': 'text/html' } });

const ACME: ServerPluginRequirement = {
  id: 'acme',
  title: 'Acme',
  packages: { node: '@acme/cli-server-plugin-acme', python: 'acme-cli-server-plugin', dotnet: 'Acme.Cli.Plugin' },
  api: '/api/acme/items',
};

/** A page loading its items, showing the failure's text or their count. */
function Items() {
  const { fetch } = useDashboard();
  const [text, setText] = useState('loading');
  useEffect(() => {
    createApi(fetch).get<unknown[]>('/api/acme/items?page=1').then(items => setText(`${items.length} items`), err => setText(`failed: ${errorText(err)}`));
  }, [fetch]);
  return <p data-testid="page">{text}</p>;
}

let unmount: (() => void) | undefined;
afterEach(() => {
  unmount?.();
  unmount = undefined;
  cleanup();
});

async function mount(answer: () => Response, requirement: ServerPluginRequirement = ACME) {
  const { context } = fakeDashboard('acme', { server: path => (path.startsWith('/api/acme/items') ? answer() : json({ error: 'not found' }, 404)) });
  unmount = await mountExtension(defineExtension(Items, { serverPlugin: requirement }), context);
}

describe('isMissingApi', () => {
  it('is a 404 without a JSON { error }: Express, an empty .NET 404, FastAPI', () => {
    expect(isMissingApi(404, EXPRESS_404)).toBe(true);
    expect(isMissingApi(404, '')).toBe(true);
    expect(isMissingApi(404, '{"detail":"Not Found"}')).toBe(true);
    expect(isMissingApi(404, '{"error":"unknown data source: x"}')).toBe(false);
    expect(isMissingApi(500, EXPRESS_404)).toBe(false);
    expect(isMissingApi(403, '')).toBe(false);
  });

  it('watches only the plugin route, passing every answer on unchanged', async () => {
    const seen: string[] = [];
    const watched = watchMissingApi(async path => (path.includes('/other') ? html(EXPRESS_404, 404) : html(EXPRESS_404, 404)), '/api/acme/items', () => seen.push('missing'));
    const res = await watched('/api/acme/other');
    expect(seen).toEqual([]);
    expect(await res.text()).toBe(EXPRESS_404);
    await watched('https://host/prefix/api/acme/items?x=1');
    expect(seen).toEqual(['missing']);
  });

  it('links the server plugins tab of the marketplace, below the dashboard', () => {
    expect(serverPluginMarketplaceHref('data-explorer', '/qcli/admin/x/data-explorer/sql')).toBe('/qcli/admin/plugins?tab=marketplace&kind=server&q=data-explorer');
    expect(serverPluginMarketplaceHref('jobs', '/elsewhere')).toBe('/plugins?tab=marketplace&kind=server&q=jobs');
  });
});

describe('defineExtension({ serverPlugin })', () => {
  it('says the server plugin is missing instead of the raw 404 page, with the marketplace and the packages', async () => {
    await mount(() => html(EXPRESS_404, 404));
    const notice = await screen.findByTestId('missing-server-plugin');
    expect(notice.textContent).toContain('This page needs the server plugin Acme');
    expect(notice.textContent).toContain('Acme is not installed on this server');
    expect(notice.textContent).not.toContain('<html');
    const open = screen.getByRole('link', { name: 'Open it in the marketplace' });
    expect(open.getAttribute('href')).toContain('/plugins?tab=marketplace&kind=server&q=acme');
    expect(notice.textContent).toContain('npm install @acme/cli-server-plugin-acme');
    expect(notice.textContent).toContain('pip install acme-cli-server-plugin');
    expect(notice.textContent).toContain('dotnet add package Acme.Cli.Plugin');
    expect(screen.queryByTestId('page')).toBeNull();
  });

  it('only says to add it in code when it is code-only', async () => {
    await mount(() => new Response(null, { status: 404 }), { ...ACME, codeOnly: true });
    await screen.findByTestId('missing-server-plugin');
    expect(screen.queryByRole('link', { name: 'Open it in the marketplace' })).toBeNull();
    expect(screen.getByText('Add it in the server’s code:')).toBeTruthy();
  });

  it("keeps the page for the plugin's own 404 and other failures, their text readable", async () => {
    await mount(() => json({ error: 'no items here' }, 404));
    await waitFor(() => expect(screen.getByTestId('page').textContent).toBe('failed: no items here'));
    expect(screen.queryByTestId('missing-server-plugin')).toBeNull();
    unmount?.();
    unmount = undefined;
    cleanup();
    await mount(() => html(EXPRESS_404.replace('Cannot GET /api/acme/items', 'boom'), 500));
    await waitFor(() => expect(screen.getByTestId('page').textContent).toBe('failed: boom'));
  });

  it('renders the page when the plugin answers', async () => {
    await mount(() => json([1, 2]));
    await waitFor(() => expect(screen.getByTestId('page').textContent).toBe('2 items'));
    await act(async () => {});
    expect(screen.queryByTestId('missing-server-plugin')).toBeNull();
  });
});
