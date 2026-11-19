// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import App from './App';
import { OPENAPI, PAGE_BODIES, installPortalFetch, setBase } from './test/fixtures';

/**
 * The servers set `<base href="<mount>/">`, so a bare `href="#x"` would resolve to `<mount>/#x` and leave the page.
 * Every in-page link must stay on the current route.
 */
function renderAt(path: string) {
  return render(
    <MemoryRouter basename="/developers" initialEntries={[`/developers${path}`]}>
      <App />
    </MemoryRouter>,
  );
}

const BODIES = {
  ...PAGE_BODIES,
  auth: '# Authentication\n\nSee [the example](#example).\n\n## Example\n\nText.\n\n## More\n\nText.\n',
};

const OPENAPI_WITH_HEADINGS = {
  ...OPENAPI,
  paths: {
    ...OPENAPI.paths,
    '/v1/rates/{country}': {
      get: { ...OPENAPI.paths['/v1/rates/{country}'].get, description: '## Notes\n\nEvery bank.' },
    },
  },
  tags: [{ name: 'Rates', description: '## Notes\n\nExchange rates.' }, { name: 'Alerts' }],
};

beforeEach(() => {
  setBase('/developers/');
  localStorage.clear();
  installPortalFetch({ bodies: BODIES, openapi: OPENAPI_WITH_HEADINGS });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setBase('/');
});

function expectSkipLinkStaysOnPage() {
  const skip = screen.getByRole('link', { name: 'Skip to content' });
  const main = screen.getByRole('main');
  expect(main.getAttribute('tabindex')).toBe('-1');
  // fireEvent returns false when the default (following the href) was prevented
  expect(fireEvent.click(skip)).toBe(false);
  expect(document.activeElement).toBe(main);
}

describe('in-page links below a mount', () => {
  it('on a guide route: the skip link focuses the content, anchors keep the guide\'s path', async () => {
    renderAt('/guides/auth');

    expect(await screen.findByRole('heading', { level: 2, name: 'Example' })).toBeTruthy();
    expectSkipLinkStaysOnPage();
    expect(screen.getByRole('link', { name: 'the example' }).getAttribute('href')).toBe('/developers/guides/auth#example');
    const toc = screen.getByRole('navigation', { name: 'On this page' });
    expect(within(toc).getByRole('link', { name: 'More' }).getAttribute('href')).toBe('/developers/guides/auth#more');
  });

  it('on a tag route: the skip link focuses the content, operation anchors keep the tag\'s path', async () => {
    renderAt('/reference/Rates');

    const op = await screen.findByTestId('operation-getRates');
    expectSkipLinkStaysOnPage();
    expect(within(op).getByRole('link', { name: 'Rates of a country' }).getAttribute('href')).toBe('/developers/reference/Rates#getRates');
    const nav = screen.getByRole('navigation', { name: 'Documentation' });
    expect(within(nav).getByRole('link', { name: /Rates of a country/ }).getAttribute('href')).toBe('/developers/reference/Rates#getRates');
  });

  it('headings in reference descriptions get no ids (no repeats, no clash with operation anchors)', async () => {
    renderAt('/reference/Rates');

    await screen.findByTestId('operation-getRates');
    const notes = screen.getAllByRole('heading', { name: 'Notes' });
    expect(notes).toHaveLength(2);
    for (const heading of notes) expect(heading.id).toBe('');
  });

  it('a malformed hash does not break a guide or a tag page', async () => {
    const first = renderAt('/guides/auth#%E0');
    expect(await screen.findByRole('heading', { level: 1, name: 'Authentication' })).toBeTruthy();
    first.unmount();

    renderAt('/reference/Rates#%E0');
    expect(await screen.findByTestId('operation-getRates')).toBeTruthy();
  });
});
