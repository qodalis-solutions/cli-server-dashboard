// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import GuidePage from './GuidePage';
import { PAGES, installPortalFetch } from '../test/fixtures';

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function renderGuide(slug: string, bodies: Record<string, string>) {
  installPortalFetch({ pages: [...PAGES, { slug: 'demo', title: 'Demo', group: 'Guides', order: 5 }], bodies });
  return render(
    <MemoryRouter initialEntries={[`/guides/${slug}`]}>
      <Routes>
        <Route path="/guides/:slug" element={<GuidePage pagesUrl="/qcli/docs/pages" />} />
      </Routes>
      <Location />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const MARKDOWN = [
  '# Demo',
  '',
  '## Requests',
  '',
  '| Header | Meaning |',
  '| --- | --- |',
  '| `X-RateLimit-Limit` | the limit |',
  '',
  '```js',
  'const res = await fetch(url);',
  '```',
  '',
].join('\n');

describe('GuidePage', () => {
  it('renders headings, tables and fenced code with highlight classes', async () => {
    const { container } = renderGuide('demo', { demo: MARKDOWN });

    expect(await screen.findByRole('heading', { level: 1, name: 'Demo' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Requests' }).id).toBe('requests');
    expect(container.querySelector('table')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Meaning' })).toBeTruthy();
    const code = container.querySelector('pre code');
    expect(code?.className).toContain('hljs');
    expect(code?.querySelector('.hljs-keyword')).toBeTruthy();
  });

  it('raw HTML in markdown is not rendered', async () => {
    const { container } = renderGuide('demo', {
      demo: '# Demo\n\nBefore <script>window.__pwned = 1</script>\n\n<img src="x" onerror="window.__pwned = 2">\n\nAfter\n',
    });

    expect(await screen.findByText(/After/)).toBeTruthy();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect((window as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it('a missing page (404) shows Not found', async () => {
    renderGuide('nope', {});

    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeTruthy();
  });

  it('relative links like ./auth navigate inside the portal', async () => {
    renderGuide('demo', { demo: '# Demo\n\nSee [x](auth), [y](./limits.md#per-day) and [z](https://example.com/a).\n' });

    const x = await screen.findByRole('link', { name: 'x' });
    expect(x.getAttribute('href')).toBe('/guides/auth');
    expect(screen.getByRole('link', { name: 'y' }).getAttribute('href')).toBe('/guides/limits#per-day');
    const external = screen.getByRole('link', { name: 'z' });
    expect(external.getAttribute('href')).toBe('https://example.com/a');
    expect(external.getAttribute('rel')).toContain('noopener');

    fireEvent.click(x);
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/guides/auth'));
  });

  it('unsafe link targets are dropped', async () => {
    renderGuide('demo', { demo: '# Demo\n\n[bad](javascript:alert(1)) and [data](data:text/html,hi)\n' });

    const bad = await screen.findByText('bad');
    expect(bad.closest('a')?.getAttribute('href') ?? '').not.toContain('javascript');
    expect(screen.getByText('data').closest('a')?.getAttribute('href') ?? '').not.toContain('data:');
  });

  it('a leading # heading is dropped only when it repeats the title', async () => {
    const first = renderGuide('demo', { demo: '# Demo\n\nBody.\n' });
    expect(await screen.findByText('Body.')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 }).map(h => h.textContent)).toEqual(['Demo']);
    first.unmount();

    renderGuide('demo', { demo: '# Something else\n\nBody.\n' });
    expect(await screen.findByText('Body.')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 }).map(h => h.textContent)).toEqual(['Demo', 'Something else']);
  });
});
