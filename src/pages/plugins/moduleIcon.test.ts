import { describe, expect, it } from 'vitest';
import { isIconUrl, moduleInitial, resolveModuleIcon, tintOf, TINT_COUNT } from './moduleIcon';

describe('resolveModuleIcon', () => {
  it('shows an emoji as text', () => {
    expect(resolveModuleIcon('🌤', 'weather')).toEqual({ kind: 'text', text: '🌤' });
    expect(resolveModuleIcon(' 👨‍💻 ', 'dev')).toEqual({ kind: 'text', text: '👨‍💻' });
  });

  it('shows a URL as an image', () => {
    expect(resolveModuleIcon('https://cdn.example.com/jobs.svg', 'jobs')).toEqual({ kind: 'image', src: 'https://cdn.example.com/jobs.svg' });
    expect(resolveModuleIcon('/qcli/admin/icons/jobs.png', 'jobs')).toEqual({ kind: 'image', src: '/qcli/admin/icons/jobs.png' });
  });

  it('never uses other schemes or long text as an icon', () => {
    for (const icon of ['javascript:alert(1)', 'data:image/svg+xml,<svg/>', '//evil.example.com/a.png', 'a whole sentence here']) {
      expect(resolveModuleIcon(icon, 'Jobs').kind).toBe('letter');
    }
  });

  it('falls back to a command icon, then to the initial', () => {
    expect(resolveModuleIcon(null, 'weather', '☀️')).toEqual({ kind: 'text', text: '☀️' });
    expect(resolveModuleIcon(undefined, '@qodalis/cli-server-jobs')).toEqual({ kind: 'letter', letter: 'C', tint: tintOf('@qodalis/cli-server-jobs') });
    expect(resolveModuleIcon('', 'jobs')).toMatchObject({ kind: 'letter', letter: 'J' });
  });
});

describe('helpers', () => {
  it('takes the initial without the npm scope', () => {
    expect(moduleInitial('@qodalis/weather')).toBe('W');
    expect(moduleInitial('  ébène')).toBe('É');
    expect(moduleInitial('---')).toBe('?');
  });

  it('gives a stable tint in range', () => {
    expect(tintOf('Jobs')).toBe(tintOf('Jobs'));
    for (const name of ['a', 'Jobs', 'Weather', '数据']) expect(tintOf(name)).toBeLessThan(TINT_COUNT);
  });

  it('recognizes icon URLs', () => {
    expect(isIconUrl('http://x.test/i.png')).toBe(true);
    expect(isIconUrl('/i.png')).toBe(true);
    expect(isIconUrl('/\\evil')).toBe(false);
    expect(isIconUrl('i.png')).toBe(false);
  });
});
