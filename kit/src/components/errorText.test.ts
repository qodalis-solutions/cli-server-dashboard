import { describe, expect, it } from 'vitest';
import { errorText, htmlErrorText, httpStatusText, isHtml, responseErrorText } from './errorText';

describe('errorText', () => {
  it("reads a server's JSON error body, never showing it raw", () => {
    expect(errorText(new Error('{"error":"forbidden: missing permission audit:read"}'))).toBe('forbidden: missing permission audit:read');
    expect(errorText('{"error":"Plugin not found","code":"PLUGIN_NOT_FOUND"}')).toBe('Plugin not found');
    expect(errorText('  {"message":"Too many queries"}\n')).toBe('Too many queries');
    expect(errorText('{"error":{"message":"nested reason"}}')).toBe('nested reason');
    // ASP.NET ProblemDetails
    expect(errorText('{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"Bad Request","status":400,"detail":"Name is required"}'))
      .toBe('Name is required');
    expect(errorText('{"title":"Not Found","status":404}')).toBe('Not Found');
  });

  it('shows a plain-text body as is', () => {
    expect(errorText(new Error('Internal Server Error'))).toBe('Internal Server Error');
    expect(errorText('upstream timed out')).toBe('upstream timed out');
  });

  it("shows a network error's message as is", () => {
    expect(errorText(new TypeError('Failed to fetch'))).toBe('Failed to fetch');
    expect(errorText(new TypeError('NetworkError when attempting to fetch resource.'))).toBe('NetworkError when attempting to fetch resource.');
  });

  it('keeps text that only looks like JSON, and JSON without a message field', () => {
    expect(errorText('{not json')).toBe('{not json');
    expect(errorText('{"code":"E42"}')).toBe('{"code":"E42"}');
    expect(errorText('{"error":""}')).toBe('{"error":""}');
  });

  it('shows anything else as text', () => {
    expect(errorText(404)).toBe('404');
    expect(errorText(new Error(''))).toBe('Error');
  });
});

describe('errorText: HTML error pages are never shown raw', () => {
  const EXPRESS = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n</head>\n<body>\n<pre>Cannot GET /api/qcli/data-explorer/sources</pre>\n</body>\n</html>\n';
  const NGINX = '<html>\r\n<head><title>502 Bad Gateway</title></head>\r\n<body>\r\n<center><h1>502 Bad Gateway</h1></center>\r\n<hr><center>nginx</center>\r\n</body>\r\n</html>';

  it("reads Express's <pre>, a proxy's <h1> or <title>", () => {
    expect(errorText(new Error(EXPRESS))).toBe('Cannot GET /api/qcli/data-explorer/sources');
    expect(errorText(NGINX)).toBe('502 Bad Gateway');
    expect(errorText('<html><head><title>Service &amp; more</title></head><body></body></html>')).toBe('Service & more');
    expect(htmlErrorText('<pre>Cannot  POST\n /x &lt;y&gt;</pre>')).toBe('Cannot POST /x <y>');
  });

  it('says the status when the page has no text ("Error" titles say nothing)', () => {
    const page = '<!DOCTYPE html><html><head><title>Error</title></head><body></body></html>';
    expect(errorText(Object.assign(new Error(page), { status: 404, statusText: '' }))).toBe('HTTP 404 Not Found');
    expect(errorText(Object.assign(new Error(page), { status: 500, statusText: 'Oops' }))).toBe('HTTP 500 Oops');
    expect(errorText(page)).toBe('HTTP error');
    expect(isHtml(page)).toBe(true);
    expect(isHtml('a < b')).toBe(false);
  });

  it('reads a failed response for an Error: JSON error, HTML text, plain text, else the status', () => {
    expect(responseErrorText(404, 'Not Found', '{"error":"unknown data source: x"}')).toBe('unknown data source: x');
    expect(responseErrorText(404, 'Not Found', EXPRESS)).toBe('Cannot GET /api/qcli/data-explorer/sources');
    expect(responseErrorText(404, '', '')).toBe('HTTP 404 Not Found');
    expect(responseErrorText(404, '', '{"code":"x"}')).toBe('HTTP 404 Not Found');
    expect(responseErrorText(503, '', 'down for maintenance')).toBe('down for maintenance');
    expect(httpStatusText(418, '')).toBe('HTTP 418');
  });
});
