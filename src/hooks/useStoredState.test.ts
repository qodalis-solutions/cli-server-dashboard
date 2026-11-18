// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { readStored, useStoredState, writeStored } from './useStoredState';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('readStored / writeStored', () => {
  it('reads back what was written', () => {
    writeStored('k', 'v');
    expect(readStored('k')).toBe('v');
    expect(readStored('missing')).toBeNull();
  });

  it('does not throw when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readStored('k')).toBeNull();
    expect(() => writeStored('k', 'v')).not.toThrow();
  });
});

describe('useStoredState', () => {
  const parseFlag = (v: string) => (v === 'true' ? true : v === 'false' ? false : null);

  it('starts from the stored value, or the fallback when there is none or it is not valid', () => {
    expect(renderHook(() => useStoredState('flag', parseFlag, () => true)).result.current[0]).toBe(true);
    localStorage.setItem('flag', 'false');
    expect(renderHook(() => useStoredState('flag', parseFlag, () => true)).result.current[0]).toBe(false);
    localStorage.setItem('flag', 'garbage');
    expect(renderHook(() => useStoredState('flag', parseFlag, () => true)).result.current[0]).toBe(true);
  });

  it('stores what is set', () => {
    const { result } = renderHook(() => useStoredState('flag', parseFlag, () => true));
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem('flag')).toBe('false');
  });
});
