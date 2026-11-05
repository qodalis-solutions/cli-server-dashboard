// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLogs } from './logs';

afterEach(() => vi.unstubAllGlobals());

function stubFetch() {
  const fetchMock = vi.fn(async () => new Response('{"entries":[],"total":0,"limit":100,"offset":0}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('getLogs', () => {
  it('sends every set filter, the search trimmed', async () => {
    const fetchMock = stubFetch();

    await getLogs({
      level: 'WARN,ERROR', search: ' timeout ', service: 'ratebell-jobs',
      from: '2026-11-05T19:00:00.000Z', to: '2026-11-05T20:00:00.000Z', limit: 100, offset: 200,
    });

    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/qcli/logs?level=WARN%2CERROR&search=timeout&service=ratebell-jobs'
      + '&from=2026-11-05T19%3A00%3A00.000Z&to=2026-11-05T20%3A00%3A00.000Z&limit=100&offset=200');
  });

  it('leaves out empty filters', async () => {
    const fetchMock = stubFetch();

    await getLogs({ search: '  ', service: '' });
    await getLogs();

    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/qcli/logs');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/qcli/logs');
  });
});
