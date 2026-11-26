// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorText } from '@qodalis/cli-server-dashboard-kit';
import { apiFetch, ApiError } from './client';
import { serverMessage } from './auth';

const EXPRESS_404 = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n</head>\n<body>\n<pre>Cannot GET /api/qcli/data-explorer/sources</pre>\n</body>\n</html>\n';

afterEach(() => vi.unstubAllGlobals());

async function failure(response: Response): Promise<ApiError> {
  vi.stubGlobal('fetch', vi.fn(async () => response));
  try {
    await apiFetch('/api/x');
  } catch (err) {
    return err as ApiError;
  }
  throw new Error('no failure');
}

describe('apiFetch failures', () => {
  it('never makes an HTML page the message: its text, the body kept', async () => {
    const err = await failure(new Response(EXPRESS_404, { status: 404, statusText: 'Not Found' }));
    expect(err.message).toBe('Cannot GET /api/qcli/data-explorer/sources');
    expect(err.body).toBe(EXPRESS_404);
    expect(errorText(err)).toBe('Cannot GET /api/qcli/data-explorer/sources');
    expect(serverMessage(err)).toBe('Cannot GET /api/qcli/data-explorer/sources');
  });

  it('an HTML page without text: HTTP 404 Not Found', async () => {
    const err = await failure(new Response('<html><body></body></html>', { status: 404 }));
    expect(err.message).toBe('HTTP 404 Not Found');
  });

  it('keeps a JSON body as sent; errorText shows its message', async () => {
    const err = await failure(new Response('{"error":"forbidden: missing permission x"}', { status: 403 }));
    expect(err.message).toBe('{"error":"forbidden: missing permission x"}');
    expect(errorText(err)).toBe('forbidden: missing permission x');
    expect(serverMessage(err)).toBe('forbidden: missing permission x');
  });
});
