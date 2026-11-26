// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { fakeDashboard, json, mountExtension } from '@qodalis/cli-server-dashboard-kit/testing';
import type { DashboardExtension, ServerPluginRequirement } from '@qodalis/cli-server-dashboard-kit';

/** Every official module: its extension, the server plugin it declares and its package.json (read by the marketplace). */
const MODULES = import.meta.glob<{ default: DashboardExtension }>('./*/src/index.tsx', { eager: true });
const REQUIREMENTS = import.meta.glob<{ SERVER_PLUGIN: ServerPluginRequirement }>('./*/src/serverPlugin.ts', { eager: true });
const PACKAGES = import.meta.glob<{ qodalis?: { serverPackages?: Record<string, string> } }>('./*/package.json', { eager: true, import: 'default' });

const names = Object.keys(MODULES).map(path => path.split('/')[1]).sort();
const EXPRESS_404 = (path: string) =>
  new Response(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Error</title></head><body><pre>Cannot GET ${path}</pre></body></html>`,
    { status: 404, headers: { 'Content-Type': 'text/html' } });

let unmount: (() => void) | undefined;
afterEach(() => {
  unmount?.();
  unmount = undefined;
  cleanup();
});

describe('official modules: their server plugin', () => {
  it('every module declares one', () => {
    expect(names).toEqual(['audit', 'data-explorer', 'databases', 'filesystem', 'jobs', 'tokens', 'users']);
    for (const name of names) expect(REQUIREMENTS[`./${name}/src/serverPlugin.ts`]?.SERVER_PLUGIN, name).toBeTruthy();
  });

  it.each(names)('%s: package.json qodalis.serverPackages is the same as the page declares', name => {
    const declared = REQUIREMENTS[`./${name}/src/serverPlugin.ts`].SERVER_PLUGIN;
    expect(PACKAGES[`./${name}/package.json`].qodalis?.serverPackages).toEqual(declared.packages);
  });

  it.each(names)('%s: says the server plugin is missing when its API is (no raw 404 page)', async name => {
    const requirement = REQUIREMENTS[`./${name}/src/serverPlugin.ts`].SERVER_PLUGIN;
    const { context } = fakeDashboard(name, {
      server: path => (path.split('?')[0] === requirement.api ? EXPRESS_404(path) : json({ error: 'not found' }, 404)),
    });
    unmount = await mountExtension(MODULES[`./${name}/src/index.tsx`].default, context);
    const notice = await screen.findByTestId('missing-server-plugin');
    expect(notice.textContent).toContain(`This page needs the server plugin ${requirement.title}`);
    expect(document.body.textContent).not.toContain('<!DOCTYPE');
    expect(document.body.textContent).not.toContain('Cannot GET');
  });
});
