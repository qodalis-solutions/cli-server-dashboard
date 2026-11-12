// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import CommandsPage from './CommandsPage';
import { I18nProvider } from '../../i18n';

const COMMANDS = [
  {
    command: 'weather',
    description: 'Shows weather information for a location',
    module: 'weather',
    icon: '🌤',
    aliases: ['wx'],
    documentation: 'Weather from wttr.in.\n\nThe default is London.',
    examples: [{ command: 'weather London', description: 'Current weather in London' }],
    parameters: [{ name: 'units', description: 'Unit system', type: 'string', required: false, defaultValue: 'metric', allowedValues: ['metric', 'imperial'], examples: ['imperial'] },
      { name: 'city', description: 'City name', type: 'string', required: false, examples: ['Paris', 'New York'] }],
    processors: [{ command: 'forecast', description: 'Shows a 3-day forecast', aliases: ['fc'] }],
  },
  { command: 'echo', description: 'Echoes text', metadata: { module: 'core' } },
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('qcli_admin_locale', 'en');
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) =>
    String(input).endsWith('/commands') ? json(COMMANDS) : json({ error: 'not found' }, 404)));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CommandsPage', () => {
  it('shows aliases, module and the details of a command', async () => {
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/commands']}>
          <CommandsPage />
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(await screen.findByText('wx')).toBeTruthy();
    expect(screen.getByText('core')).toBeTruthy();

    fireEvent.click(screen.getByText('Shows weather information for a location'));
    expect(screen.getByText('The default is London.')).toBeTruthy();
    expect(screen.getByText('weather London')).toBeTruthy();
    expect(screen.getAllByText('imperial').length).toBe(2);
    expect(screen.getByText('Paris')).toBeTruthy();
    expect(screen.getByText('New York')).toBeTruthy();
    expect(screen.getByText('fc')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Search commands…'), { target: { value: 'wx' } });
    expect(screen.queryByText('echo')).toBeNull();
  });

  it('expands a command from the keyboard through its button', async () => {
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/commands']}>
          <CommandsPage />
        </MemoryRouter>
      </I18nProvider>,
    );

    const toggle = (await screen.findByText('weather', { selector: 'span' })).closest('button')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('The default is London.')).toBeTruthy();
    // echo has nothing to expand: no button
    expect(screen.getByText('echo').closest('button')).toBeNull();
  });
});
