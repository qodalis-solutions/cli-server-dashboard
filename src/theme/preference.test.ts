// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  THEME_CHOICE_KEY,
  applyDashboardTheme,
  currentThemeChoice,
  readThemeChoice,
  resetThemeChoiceForTests,
  resolveThemeMode,
  setThemeChoice,
} from './preference';
import { DEFAULT_THEME, type DashboardTheme } from './tokens';

const root = () => document.documentElement.dataset.qcliTheme;
const server = (mode: DashboardTheme['mode']): DashboardTheme => ({ ...DEFAULT_THEME, mode });

/** A matchMedia whose `(prefers-color-scheme: light)` answer can be changed, firing `change`. */
function mockMatchMedia(light: boolean) {
  const listeners = new Set<() => void>();
  const list = {
    get matches() { return light; },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  vi.stubGlobal('matchMedia', vi.fn(() => list));
  return (next: boolean) => {
    light = next;
    listeners.forEach(fn => fn());
  };
}

beforeEach(() => {
  localStorage.clear();
  resetThemeChoiceForTests();
  delete document.documentElement.dataset.qcliTheme;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('resolveThemeMode', () => {
  it('prefers the viewer\'s choice over the server\'s mode', () => {
    expect(resolveThemeMode('dark', 'light')).toBe('light');
    expect(resolveThemeMode('light', 'system')).toBe('system');
    expect(resolveThemeMode('light', null)).toBe('light');
  });
});

describe('applyDashboardTheme', () => {
  it('uses the stored choice over the server\'s mode', () => {
    localStorage.setItem(THEME_CHOICE_KEY, 'light');
    applyDashboardTheme(server('dark'));
    expect(root()).toBe('light');
    expect(currentThemeChoice()).toBe('light');
  });

  it('uses the server\'s mode without a stored choice, and shows it as the current choice', () => {
    applyDashboardTheme(server('light'));
    expect(root()).toBe('light');
    expect(currentThemeChoice()).toBe('light');
    applyDashboardTheme(server('system'));
    expect(currentThemeChoice()).toBe('system');
  });

  it('ignores an unknown stored value', () => {
    localStorage.setItem(THEME_CHOICE_KEY, 'purple');
    expect(readThemeChoice()).toBeNull();
    applyDashboardTheme(server('light'));
    expect(root()).toBe('light');
  });

  it('applies early, before the server answers: the defaults in the saved scheme', () => {
    localStorage.setItem(THEME_CHOICE_KEY, 'light');
    applyDashboardTheme(DEFAULT_THEME);
    expect(root()).toBe('light');
    expect(document.getElementById('qcli-theme')?.textContent).toContain('[data-qcli-theme="light"]');
  });

  it('falls back to dark for Device without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    localStorage.setItem(THEME_CHOICE_KEY, 'system');
    applyDashboardTheme(server('light'));
    expect(root()).toBe('dark');
  });
});

describe('Device', () => {
  it('follows the OS scheme live', () => {
    const setLight = mockMatchMedia(false);
    setThemeChoice('system');
    expect(root()).toBe('dark');
    setLight(true);
    expect(root()).toBe('light');
    setLight(false);
    expect(root()).toBe('dark');
  });

  it('stops following the OS once Light or Dark is chosen', () => {
    const setLight = mockMatchMedia(false);
    setThemeChoice('system');
    setThemeChoice('dark');
    setLight(true);
    expect(root()).toBe('dark');
  });
});

describe('setThemeChoice', () => {
  it('persists the choice and keeps the server\'s colors', () => {
    applyDashboardTheme({ ...server('dark'), light: { ...DEFAULT_THEME.light, primary: '#123456' } });
    setThemeChoice('light');
    expect(localStorage.getItem(THEME_CHOICE_KEY)).toBe('light');
    expect(root()).toBe('light');
    expect(document.getElementById('qcli-theme')?.textContent).toContain('#123456');
    // A later load reads it back
    resetThemeChoiceForTests();
    expect(readThemeChoice()).toBe('light');
  });

  it('still switches for this page when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    applyDashboardTheme(server('dark'));
    expect(root()).toBe('dark');
    setThemeChoice('light');
    expect(root()).toBe('light');
    expect(currentThemeChoice()).toBe('light');
  });
});
