import { describe, expect, it } from 'vitest';
import { messages } from '../../i18n/messages';
import { formatMemorySize, systemMemoryNote } from './systemMemory';

const formatNumber = (value: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat('en', options).format(value);
const overview = messages.overview as unknown as Record<string, Record<string, string>>;
const t = (key: string, params: Record<string, string | number> = {}) =>
  overview.en[key.replace('overview.', '')].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name]));

describe('systemMemoryNote', () => {
  it('the machine total and its use, or the total alone', () => {
    expect(systemMemoryNote({ systemMemoryTotalMb: 16384, systemMemoryUsedMb: 10035, memoryLimited: false }, t, formatNumber)).toBe('of 16 GB · machine 61% used');
    expect(systemMemoryNote({ systemMemoryTotalMb: 16384, systemMemoryUsedMb: null, memoryLimited: false }, t, formatNumber)).toBe('of 16 GB');
  });

  it('the container limit and its use, or the limit alone', () => {
    expect(systemMemoryNote({ systemMemoryTotalMb: 512, systemMemoryUsedMb: 300, memoryLimited: true }, t, formatNumber)).toBe('container limit 512 MB · 59% used');
    expect(systemMemoryNote({ systemMemoryTotalMb: 512, systemMemoryUsedMb: null, memoryLimited: true }, t, formatNumber)).toBe('container limit 512 MB');
  });

  it('null without a total (older servers, unreadable values)', () => {
    expect(systemMemoryNote({}, t, formatNumber)).toBeNull();
    expect(systemMemoryNote({ systemMemoryTotalMb: null, systemMemoryUsedMb: 5, memoryLimited: null }, t, formatNumber)).toBeNull();
  });

  it('sizes: MB below 1 GB, GB with one decimal from 1 GB', () => {
    expect(formatMemorySize(1023, formatNumber)).toBe('1,023 MB');
    expect(formatMemorySize(1024, formatNumber)).toBe('1 GB');
    expect(formatMemorySize(10035, formatNumber)).toBe('9.8 GB');
  });

  it('is translated in every language', () => {
    for (const [locale, table] of Object.entries(overview)) {
      for (const key of ['memoryMachine', 'memoryOfTotal', 'memoryContainer', 'memoryContainerLimit']) {
        expect(table[key], `${locale} ${key}`).toContain('{total}');
      }
      expect(table.memoryMachine, locale).toContain('{percent}');
      expect(table.memoryContainer, locale).toContain('{percent}');
    }
    expect(Object.keys(overview)).toHaveLength(11);
  });
});
