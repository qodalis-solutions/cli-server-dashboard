// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { defineExtension, useDashboard, type ConfigEditorMount, type ConfigEditorProps, type DashboardExtensionInfo } from '@qodalis/cli-server-dashboard-kit';
import ConfigEditorHost from './ConfigEditorHost';
import { registerConfigEditor, useConfigEditors } from './configEditors';
import { I18nProvider } from '../../i18n';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const EXTENSION: DashboardExtensionInfo = { id: 'scheduler', title: 'Scheduler', entry: '/x.js', widgets: ['config'] };

function props(patch: Partial<ConfigEditorProps> = {}): ConfigEditorProps {
  return {
    entry: { key: 'schedule', label: 'Schedule', description: '', type: 'string', editor: 'cron', default: null },
    value: '0 * * * *',
    onChange: () => {},
    disabled: false,
    ...patch,
  };
}

function host(editor: Parameters<typeof ConfigEditorHost>[0]['editor'], p: ConfigEditorProps) {
  return (
    <I18nProvider>
      <MemoryRouter>
        <ConfigEditorHost editor={editor} props={p} />
      </MemoryRouter>
    </I18nProvider>
  );
}

describe('ConfigEditorHost', () => {
  it('renders a dashboard component with the props', () => {
    render(host({ kind: 'component', Component: p => <span>value:{String(p.value)}</span> }, props()));
    expect(screen.getByText('value:0 * * * *')).toBeTruthy();
  });

  it("mounts a module's editor into its own element with the module's context, updates and unmounts it", async () => {
    const update = vi.fn();
    const unmount = vi.fn();
    const mount = vi.fn<ConfigEditorMount>((element, p) => {
      element.textContent = `mounted:${String(p.value)}`;
      return { update, unmount };
    });
    const view = render(host({ kind: 'module', extension: EXTENSION, mount }, props()));
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
    const [element, p, context] = mount.mock.calls[0];
    expect(element.isConnected).toBe(true);
    expect(element.closest('[data-config-editor="scheduler:cron"]')).not.toBeNull();
    expect(p.value).toBe('0 * * * *');
    expect(context.extension.id).toBe('scheduler');
    expect(screen.getByText('mounted:0 * * * *')).toBeTruthy();

    view.rerender(host({ kind: 'module', extension: EXTENSION, mount }, props({ value: '*/5 * * * *', error: 'bad' })));
    await waitFor(() => expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ value: '*/5 * * * *', error: 'bad' })));
    expect(mount).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(unmount).toHaveBeenCalledTimes(1);
  });

  it('shows the error of a module editor that fails to mount', async () => {
    const mount: ConfigEditorMount = () => { throw new Error('no cron today'); };
    render(host({ kind: 'module', extension: EXTENSION, mount }, props()));
    expect((await screen.findByRole('alert')).textContent).toBe('no cron today');
  });
});

describe('registerConfigEditor / useConfigEditors', () => {
  it('adds and removes a dashboard editor by hint; open pages follow', () => {
    const { result } = renderHook(() => useConfigEditors(), { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
    expect(result.current.has('cron')).toBe(false);
    const Editor = () => null;
    let off!: () => void;
    act(() => { off = registerConfigEditor('cron', Editor); });
    expect(result.current.get('cron')).toEqual({ kind: 'component', Component: Editor });
    act(() => off());
    expect(result.current.has('cron')).toBe(false);
  });
});

describe('defineExtension configEditors', () => {
  it('turns React editors into mount functions that render with the dashboard context and follow updates', async () => {
    function Cron(p: ConfigEditorProps) {
      const { extension } = useDashboard();
      return <button type="button" onClick={() => p.onChange('changed')} disabled={p.disabled}>{extension.id}:{String(p.value)}</button>;
    }
    const module = defineExtension(() => null, { configEditors: { cron: Cron } });
    const mount = module.configEditors!.cron;
    const element = document.createElement('div');
    document.body.appendChild(element);
    const onChange = vi.fn();
    const context = { extension: EXTENSION, language: 'en' } as Parameters<ConfigEditorMount>[2];
    let handle!: ReturnType<ConfigEditorMount>;
    await act(async () => { handle = mount(element, props({ onChange }), context); });
    expect(element.textContent).toBe('scheduler:0 * * * *');
    act(() => (element.querySelector('button') as HTMLButtonElement).click());
    expect(onChange).toHaveBeenCalledWith('changed');
    await act(async () => { handle!.update(props({ value: 'next', disabled: true })); });
    expect(element.textContent).toBe('scheduler:next');
    expect((element.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { handle!.unmount?.(); });
    expect(element.textContent).toBe('');
    element.remove();
  });

  it('leaves configEditors out when none are given', () => {
    expect(defineExtension(() => null).configEditors).toBeUndefined();
  });
});
