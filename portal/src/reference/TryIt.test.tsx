// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TryIt from './TryIt';
import { ReferenceStateProvider } from './ReferenceState';
import { groupByTag, type Operation } from './openapi';
import { OPENAPI, json } from '../test/fixtures';

const SERVER = 'https://api.example.com';
const ops = groupByTag(OPENAPI).flatMap(t => t.operations);
const getRates = ops.find(o => o.path === '/v1/rates/{country}')!;
const postAlert = ops.find(o => o.path === '/v1/alerts')!;
const health = ops.find(o => o.path === '/health')!;

function renderTryIt(op: Operation) {
  return render(
    <ReferenceStateProvider>
      <TryIt operation={op} serverUrl={SERVER} />
    </ReferenceStateProvider>,
  );
}

const tokenInput = () => screen.getByLabelText('API token') as HTMLInputElement;
const send = () => fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/reference/Rates');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('TryIt', () => {
  it('sends the request with the pasted token and shows status, X-RateLimit headers and body', async () => {
    const fetchMock = vi.fn(async () => json([{ currency: 'EUR', buy: 19.45 }], 200, {
      'X-RateLimit-Limit': '1000',
      'X-RateLimit-Remaining': '999',
      'X-RateLimit-Reset': '3600',
    }));
    vi.stubGlobal('fetch', fetchMock);
    renderTryIt(getRates);

    fireEvent.change(tokenInput(), { target: { value: 'qcli_pat_x' } });
    send();

    expect(await screen.findByText('200')).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.com/v1/rates/md');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer qcli_pat_x');
    expect(init.credentials).toBe('omit');
    expect(screen.getByText('X-RateLimit-Limit')).toBeTruthy();
    expect(screen.getByText('1000')).toBeTruthy();
    expect(screen.getByText('X-RateLimit-Remaining')).toBeTruthy();
    expect(screen.getByText('999')).toBeTruthy();
    expect(screen.getByText('X-RateLimit-Reset')).toBeTruthy();
    expect(screen.getByTestId('tryit-body').textContent).toContain('"currency": "EUR"');
  });

  it('path and query parameters are editable and encoded', async () => {
    const fetchMock = vi.fn(async () => json([]));
    vi.stubGlobal('fetch', fetchMock);
    renderTryIt(getRates);

    fireEvent.change(screen.getByLabelText('country'), { target: { value: 'r o' } });
    fireEvent.change(screen.getByLabelText('currency'), { target: { value: 'EUR&x=1' } });
    send();

    await screen.findByText('200');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/v1/rates/r%20o?currency=EUR%26x%3D1');
  });

  it('the token is not stored', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({})));
    renderTryIt(getRates);

    const input = tokenInput();
    expect(input.type).toBe('password');
    expect(input.getAttribute('autocomplete')).toBe('off');
    fireEvent.change(input, { target: { value: 'qcli_pat_x' } });
    send();
    await screen.findByText('200');

    const stored = [
      ...Object.keys(localStorage).map(k => `${k}=${localStorage.getItem(k)}`),
      ...Object.keys(sessionStorage).map(k => `${k}=${sessionStorage.getItem(k)}`),
      document.cookie,
      window.location.href,
    ].join('\n');
    expect(stored).not.toContain('qcli_pat_x');
  });

  it('the token is kept while switching operations in the same tab and gone after a remount', () => {
    const { rerender, unmount } = renderTryIt(getRates);
    fireEvent.change(tokenInput(), { target: { value: 'qcli_pat_x' } });

    rerender(
      <ReferenceStateProvider>
        <TryIt operation={postAlert} serverUrl={SERVER} />
      </ReferenceStateProvider>,
    );
    expect(tokenInput().value).toBe('qcli_pat_x');

    unmount();
    renderTryIt(getRates);
    expect(tokenInput().value).toBe('');
  });

  it('a network/CORS failure shows "Request failed: <message>"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    renderTryIt(getRates);

    send();

    expect(await screen.findByText('Request failed: Failed to fetch')).toBeTruthy();
  });

  it('invalid JSON body shows "Body is not valid JSON" and sends nothing', async () => {
    const fetchMock = vi.fn(async () => json({}));
    vi.stubGlobal('fetch', fetchMock);
    renderTryIt(postAlert);

    fireEvent.change(screen.getByLabelText('Request body'), { target: { value: '{bad' } });
    send();

    expect(await screen.findByText('Body is not valid JSON')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a JSON body is sent with its Content-Type, prefilled from the schema', async () => {
    const fetchMock = vi.fn(async () => json({ id: 1 }, 201));
    vi.stubGlobal('fetch', fetchMock);
    renderTryIt(postAlert);

    expect((screen.getByLabelText('Request body') as HTMLTextAreaElement).value).toContain('"currency": "EUR"');
    send();

    expect(await screen.findByText('201')).toBeTruthy();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ currency: 'EUR', above: 20 });
  });

  it('without a token no Authorization header is sent (public operations)', async () => {
    const fetchMock = vi.fn(async () => new Response('ok', { status: 200, headers: { 'Content-Type': 'text/plain' } }));
    vi.stubGlobal('fetch', fetchMock);
    renderTryIt(health);

    send();

    await screen.findByText('200');
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers).not.toHaveProperty('Authorization');
    expect(screen.getByTestId('tryit-body').textContent).toBe('ok');
  });
});
