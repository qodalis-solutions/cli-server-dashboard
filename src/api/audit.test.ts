// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatProperties, getAudit } from './audit';

afterEach(() => vi.unstubAllGlobals());

describe('getAudit', () => {
  it('sends only the set filters, trimmed', async () => {
    const fetchMock = vi.fn(async () => new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await getAudit({ event: 'login', actor: ' alice ', username: '', limit: 51, offset: 50 });

    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/qcli/audit?event=login&actor=alice&limit=51&offset=50');
  });

  it('asks for everything without filters', async () => {
    const fetchMock = vi.fn(async () => new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await getAudit();

    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/qcli/audit');
  });
});

describe('formatProperties', () => {
  it('formats values as key=value, objects as JSON', () => {
    expect(formatProperties({ items: 32, source: 'bnr', ok: true, none: null, tags: ['a'], range: { from: 1 } }))
      .toEqual(['items=32', 'source=bnr', 'ok=true', 'none=null', 'tags=["a"]', 'range={"from":1}']);
  });

  it('is empty without properties', () => {
    expect(formatProperties(undefined)).toEqual([]);
    expect(formatProperties({})).toEqual([]);
  });
});
