// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import App from '../App';
import { OPENAPI, PORTAL_CONFIG, installPortalFetch, setBase } from '../test/fixtures';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  setBase('/');
  localStorage.clear();
  installPortalFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const operation = (id: string) => screen.findByTestId(`operation-${id}`);

describe('TagPage', () => {
  it('shows operations of the tag with method, path and the permission badge (x-required-permission)', async () => {
    renderAt('/reference/Rates');

    expect(await screen.findByRole('heading', { level: 1, name: 'Rates' })).toBeTruthy();
    const op = await operation('getRates');
    expect(within(op).getByText('GET')).toBeTruthy();
    expect(within(op).getByText('/v1/rates/{country}')).toBeTruthy();
    expect(within(op).getByRole('heading', { level: 2, name: 'Rates of a country' })).toBeTruthy();
    expect(within(op).getByText('rates:read')).toBeTruthy();
    expect(within(op).getByText('Host token')).toBeTruthy();
    expect(within(op).getByText('Every bank of the country, latest rates.')).toBeTruthy();
    // Only this tag's operations
    expect(screen.queryByText('/v1/alerts')).toBeNull();
  });

  it('a list of required permissions shows each one', async () => {
    installPortalFetch({
      openapi: {
        ...OPENAPI,
        paths: { '/v1/x': { get: { tags: ['Rates'], operationId: 'x', 'x-required-permission': ['rates:read', 'rates:export'], responses: {} } } },
      },
    });
    renderAt('/reference/Rates');

    const op = await operation('x');
    expect(within(op).getByText('rates:read')).toBeTruthy();
    expect(within(op).getByText('rates:export')).toBeTruthy();
  });

  it('parameters table lists path and query parameters with required marks', async () => {
    renderAt('/reference/Rates');

    const table = within(await operation('getRates')).getByRole('table', { name: 'Parameters' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('country')).toBeTruthy();
    expect(within(rows[0]).getByText('path')).toBeTruthy();
    expect(within(rows[0]).getByText('required')).toBeTruthy();
    expect(within(rows[1]).getByText('currency')).toBeTruthy();
    expect(within(rows[1]).getByText('query')).toBeTruthy();
    expect(within(rows[1]).queryByText('required')).toBeNull();
    expect(within(rows[1]).getByText('One currency only')).toBeTruthy();
  });

  it('shows the response schema, with $ref resolved', async () => {
    renderAt('/reference/Rates');

    const op = await operation('getRates');
    expect(within(op).getByText('200')).toBeTruthy();
    expect(within(op).getByText('The rates')).toBeTruthy();
    expect(within(op).getAllByText('currency').length).toBeGreaterThan(0);
    expect(within(op).getByText('ISO 4217 code')).toBeTruthy();
  });

  it('code tabs switch languages', async () => {
    renderAt('/reference/Rates');

    const op = await operation('getRates');
    const tabs = within(op).getByRole('tablist', { name: 'Code samples' });
    expect(within(tabs).getAllByRole('tab').map(t => t.textContent)).toEqual(['cURL', 'JavaScript', 'Python', 'C#', 'PHP', 'Go', 'Java']);
    expect(within(op).getByRole('tabpanel').textContent).toContain("curl -X GET 'https://api.example.com/v1/rates/md'");

    fireEvent.click(within(tabs).getByRole('tab', { name: 'Python' }));

    expect(within(tabs).getByRole('tab', { name: 'Python' }).getAttribute('aria-selected')).toBe('true');
    expect(within(op).getByRole('tabpanel').textContent).toContain('requests.request(');
  });

  it('the chosen language applies to every operation, also on another tag', async () => {
    renderAt('/reference/Rates');

    const op = await operation('getRates');
    fireEvent.click(within(op).getByRole('tab', { name: 'Go' }));
    fireEvent.click(within(await screen.findByRole('navigation', { name: 'Documentation' })).getByRole('link', { name: 'Alerts' }));

    const alerts = await operation('post-v1-alerts');
    expect(within(alerts).getByRole('tab', { name: 'Go' }).getAttribute('aria-selected')).toBe('true');
  });

  it('unknown tag shows Not found', async () => {
    renderAt('/reference/Nope');

    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeTruthy();
  });

  it('the navigation lists the tags under API reference', async () => {
    renderAt('/reference');

    const nav = await screen.findByRole('navigation', { name: 'Documentation' });
    const tags = await within(nav).findByRole('list', { name: 'API reference' });
    expect(within(tags).getAllByRole('link').map(a => a.textContent)).toEqual(['Rates', 'Alerts', 'Other']);
    expect(within(tags).getByRole('link', { name: 'Rates' }).getAttribute('href')).toBe('/reference/Rates');
  });

  it('the overview: title, base URL, authentication, tags and the Swagger UI link', async () => {
    renderAt('/reference');

    expect(await screen.findByRole('heading', { level: 1, name: 'RateBell public API' })).toBeTruthy();
    const main = screen.getByRole('main');
    expect(within(main).getByText('https://api.example.com')).toBeTruthy();
    expect(within(main).getByRole('heading', { name: 'Authentication' })).toBeTruthy();
    expect(within(main).getAllByText(/Authorization: Bearer/).length).toBeGreaterThan(0);
    expect(within(main).getByRole('link', { name: /Rates/ }).getAttribute('href')).toBe('/reference/Rates');
    expect(within(main).getByRole('link', { name: 'Swagger UI' }).getAttribute('href')).toBe('/qcli/api/swagger');
  });

  it('a document that fails to load shows an error, the guides still work', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      if (input.endsWith('/portal.json')) return new Response(JSON.stringify(PORTAL_CONFIG), { status: 200 });
      if (input === '/qcli/docs/pages') return new Response('[]', { status: 200 });
      return new Response('boom', { status: 500 });
    }));
    renderAt('/reference');

    expect(await screen.findByText('The API reference could not be loaded')).toBeTruthy();
  });
});
