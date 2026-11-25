// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import ThemePicker from './ThemePicker';
import { I18nProvider } from '../i18n';
import { DEFAULT_THEME, THEME_CHOICE_KEY, applyDashboardTheme, resetThemeChoiceForTests, setThemeChoice } from '../theme';

const root = () => document.documentElement.dataset.qcliTheme;
const radio = (name: string) => screen.getByRole('radio', { name });
const checked = () => screen.getAllByRole('radio').filter(r => r.getAttribute('aria-checked') === 'true').map(r => r.getAttribute('aria-label'));

function renderPicker(locale = 'en', touch = false) {
  localStorage.setItem('qcli_admin_locale', locale);
  return render(<I18nProvider><ThemePicker touch={touch} /></I18nProvider>);
}

beforeEach(() => {
  localStorage.clear();
  resetThemeChoiceForTests();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })));
  applyDashboardTheme(DEFAULT_THEME);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ThemePicker', () => {
  it('renders Device, Light and Dark as a radio group showing the server\'s mode without a choice', () => {
    act(() => applyDashboardTheme({ ...DEFAULT_THEME, mode: 'light' }));
    renderPicker();
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeTruthy();
    expect(screen.getAllByRole('radio').map(r => r.getAttribute('aria-label'))).toEqual(['Device', 'Light', 'Dark']);
    expect(checked()).toEqual(['Light']);
    // Only the checked option is in the tab order
    expect(radio('Light').tabIndex).toBe(0);
    expect(radio('Dark').tabIndex).toBe(-1);
  });

  it('switches live and remembers the choice on click', () => {
    renderPicker();
    expect(checked()).toEqual(['Dark']);
    fireEvent.click(radio('Light'));
    expect(root()).toBe('light');
    expect(checked()).toEqual(['Light']);
    expect(localStorage.getItem(THEME_CHOICE_KEY)).toBe('light');
    fireEvent.click(radio('Device'));
    expect(localStorage.getItem(THEME_CHOICE_KEY)).toBe('system');
    expect(checked()).toEqual(['Device']);
  });

  it('moves and chooses with the arrow keys, Home and End, wrapping around', () => {
    renderPicker();
    radio('Dark').focus();
    fireEvent.keyDown(radio('Dark'), { key: 'ArrowRight' });
    expect(checked()).toEqual(['Device']);
    expect(document.activeElement).toBe(radio('Device'));
    fireEvent.keyDown(radio('Device'), { key: 'ArrowLeft' });
    expect(checked()).toEqual(['Dark']);
    fireEvent.keyDown(radio('Dark'), { key: 'Home' });
    expect(checked()).toEqual(['Device']);
    fireEvent.keyDown(radio('Device'), { key: 'ArrowDown' });
    expect(checked()).toEqual(['Light']);
    expect(root()).toBe('light');
    fireEvent.keyDown(radio('Light'), { key: 'End' });
    expect(checked()).toEqual(['Dark']);
    expect(document.activeElement).toBe(radio('Dark'));
    // Other keys are left alone
    fireEvent.keyDown(radio('Dark'), { key: 'a' });
    expect(checked()).toEqual(['Dark']);
  });

  it('follows a choice made elsewhere (the command palette)', () => {
    renderPicker();
    act(() => setThemeChoice('light'));
    expect(checked()).toEqual(['Light']);
  });

  it('is translated and has touch-size targets in the drawer', () => {
    renderPicker('de', true);
    expect(screen.getByRole('radiogroup', { name: 'Design' })).toBeTruthy();
    expect(screen.getAllByRole('radio').map(r => r.getAttribute('aria-label'))).toEqual(['Gerät', 'Hell', 'Dunkel']);
    expect(radio('Hell').className).toContain('min-h-11');
  });
});
