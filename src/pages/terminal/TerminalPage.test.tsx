// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import TerminalPage from './TerminalPage';
import { resolvePanelTheme } from '@qodalis/cli-core';
import { terminalTheme } from './terminalTheme';
import { I18nProvider } from '../../i18n';

const engine = { setTheme: vi.fn(), getContext: () => undefined };
const seen: { options?: { theme?: unknown } } = {};

// xterm.js needs a real browser: a stand-in that reports the options it got and hands out a fake engine
vi.mock('@qodalis/react-cli', () => ({
  CliConfigProvider: ({ options, children }: { options: { theme?: unknown }; children: ReactNode }) => {
    seen.options = options;
    return <>{children}</>;
  },
  // Ready once, like the real one
  Cli: ({ onReady }: { onReady: (e: typeof engine) => void }) => {
    useEffect(() => onReady(engine), []); // eslint-disable-line react-hooks/exhaustive-deps
    return <div>terminal</div>;
  },
}));
vi.mock('./terminalUsers', () => ({ hasUsersSession: () => Promise.resolve(false), embeddedUsersModule: vi.fn() }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ logout: vi.fn() }) }));

const setScheme = (scheme: string) => act(() => { document.documentElement.dataset.qcliTheme = scheme; });

beforeEach(() => {
  localStorage.setItem('qcli_admin_locale', 'en');
  document.documentElement.dataset.qcliTheme = 'light';
  engine.setTheme.mockClear();
});
afterEach(cleanup);

describe('TerminalPage theme', () => {
  it('opens the terminal in the dashboard\'s scheme and follows its switches live', async () => {
    render(<I18nProvider><TerminalPage /></I18nProvider>);
    await screen.findByText('terminal');
    expect(seen.options?.theme).toBe('light');
    expect(engine.setTheme).not.toHaveBeenCalled();

    setScheme('dark');
    await vi.waitFor(() => expect(engine.setTheme).toHaveBeenLastCalledWith(terminalTheme('dark')));
    setScheme('light');
    await vi.waitFor(() => expect(engine.setTheme).toHaveBeenLastCalledWith(terminalTheme('light')));
    expect(engine.setTheme).toHaveBeenCalledTimes(2);
  });

  it('uses the CLI\'s light and dark terminal colors', () => {
    // The CLI's own palettes (no colors written here: the dashboard's sources use theme tokens only)
    expect(terminalTheme('light')).toEqual(resolvePanelTheme('light', false).terminal);
    expect(terminalTheme('dark')).toEqual(resolvePanelTheme('dark', true).terminal);
    expect(terminalTheme('light').background).not.toEqual(terminalTheme('dark').background);
  });
});
