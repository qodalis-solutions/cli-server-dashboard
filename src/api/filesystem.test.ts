// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pathIn, uploadFile } from './filesystem';

afterEach(() => vi.unstubAllGlobals());

describe('pathIn', () => {
  it('joins a folder and a name, at the root and below it', () => {
    expect(pathIn('/', 'rates.csv')).toBe('/rates.csv');
    expect(pathIn('/reports', 'rates.csv')).toBe('/reports/rates.csv');
    expect(pathIn('/reports/', 'rates.csv')).toBe('/reports/rates.csv');
  });
});

describe('uploadFile', () => {
  it('sends the file with its full path, folder and file name, as every server expects', async () => {
    const fetchMock = vi.fn(async () => new Response('{"path":"/reports/rates.csv","size":5}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await uploadFile('/reports', new File(['EUR,1'], 'rates.csv'));

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/qcli/fs/upload');
    const form = init.body as FormData;
    expect(form.get('path')).toBe('/reports/rates.csv');
    expect((form.get('file') as File).name).toBe('rates.csv');
  });
});
