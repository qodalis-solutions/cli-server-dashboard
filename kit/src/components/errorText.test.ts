import { describe, expect, it } from 'vitest';
import { errorText } from './errorText';

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
