import { describe, expect, it } from 'vitest';
import { EXPIRING_SOON, errorMessage, isLinkedTerminal, linkedClient, tokenState } from './tokenInfo';

describe('linked terminals', () => {
  it('recognises tokens created by server linking', () => {
    expect(isLinkedTerminal({ name: 'link Qodalis CLI on Pixel 7' })).toBe(true);
    expect(isLinkedTerminal({ name: 'Link laptop' })).toBe(true);
    expect(isLinkedTerminal({ name: 'linkedin-sync' })).toBe(false);
    expect(isLinkedTerminal({ name: 'ci' })).toBe(false);
  });

  it('names the terminal', () => {
    expect(linkedClient({ name: 'link Qodalis CLI on Pixel 7' })).toBe('Qodalis CLI on Pixel 7');
    expect(linkedClient({ name: 'ci' })).toBe('ci');
  });
});

describe('tokenState', () => {
  const now = 1_000_000_000_000;
  it('tells active, expiring and expired tokens apart', () => {
    expect(tokenState({ expiresAt: null }, now)).toBe('active');
    expect(tokenState({ expiresAt: now + EXPIRING_SOON * 2 }, now)).toBe('active');
    expect(tokenState({ expiresAt: now + 1000 }, now)).toBe('expiring');
    expect(tokenState({ expiresAt: now }, now)).toBe('expired');
  });
});

describe('errorMessage', () => {
  it('reads the error of a JSON body', () => {
    expect(errorMessage(new Error('{"error":"forbidden: missing permission tokens:read"}'))).toBe('forbidden: missing permission tokens:read');
    expect(errorMessage(new Error('Not Found'))).toBe('Not Found');
  });
});
