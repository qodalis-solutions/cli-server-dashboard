// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { KitProvider } from '../i18n/text';
import { EmptyState, ErrorState } from './States';
import { accessDenied } from './errorText';

afterEach(cleanup);

describe('EmptyState', () => {
  it('says "No data" by default, in the KitProvider language', () => {
    render(<EmptyState />);
    expect(screen.getByText('No data')).toBeTruthy();
    cleanup();
    render(<KitProvider locale="es"><EmptyState /></KitProvider>);
    expect(screen.getByText('Sin datos')).toBeTruthy();
  });

  it('shows its message, detail and action, and takes classes', () => {
    const clear = vi.fn();
    const { container } = render(
      <EmptyState message="No events match" detail="3 hidden" action={<button onClick={clear}>Clear</button>} className="bg-surface" />,
    );
    expect(screen.getByText('No events match')).toBeTruthy();
    expect(screen.getByText('3 hidden')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(clear).toHaveBeenCalledTimes(1);
    expect((container.firstElementChild as HTMLElement).className).toContain('bg-surface');
  });

  it('is not an alert (nothing failed)', () => {
    render(<EmptyState message="Nothing yet" />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('ErrorState', () => {
  it('is an alert with the title and the reason of an Error', () => {
    render(<ErrorState title="Failed to load commands" error={new Error('HTTP 500')} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Failed to load commands');
    expect(alert.textContent).toContain('HTTP 500');
  });

  it('shows a string reason as is and anything else as text', () => {
    render(<ErrorState error="disk full" />);
    expect(screen.getByText('disk full')).toBeTruthy();
    cleanup();
    render(<ErrorState error={404} />);
    expect(screen.getByText('404')).toBeTruthy();
    cleanup();
    render(<ErrorState error={new Error('')} />);
    expect(screen.getByRole('alert').textContent).toContain('Error');
  });

  it('defaults its title to "Could not load the data" in the KitProvider language, without a reason line', () => {
    render(<ErrorState />);
    expect(screen.getByRole('alert').textContent).toBe('Could not load the data');
    cleanup();
    for (const empty of [undefined, null, '']) {
      render(<KitProvider locale="de"><ErrorState error={empty} /></KitProvider>);
      expect(screen.getByRole('alert').textContent).toBe('Die Daten konnten nicht geladen werden');
      cleanup();
    }
  });

  it('has a Retry button only with onRetry, calling it on every click', () => {
    render(<ErrorState error="x" />);
    expect(screen.queryByRole('button')).toBeNull();
    cleanup();
    const retry = vi.fn();
    render(<ErrorState error="x" onRetry={retry} />);
    const button = screen.getByRole('button', { name: 'Retry' });
    expect(button.getAttribute('type')).toBe('button');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(retry).toHaveBeenCalledTimes(2);
  });

  it('translates Retry', () => {
    render(<KitProvider locale="ru"><ErrorState onRetry={() => {}} /></KitProvider>);
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeTruthy();
  });

  it('is tighter when compact and takes classes', () => {
    render(<ErrorState compact className="mb-3" />);
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('px-3 py-2');
    expect(alert.className).toContain('mb-3');
    cleanup();
    render(<ErrorState />);
    expect(screen.getByRole('alert').className).toContain('p-4');
  });

  it("never shows a raw JSON body: the server's message, a plain-text body or a network error as is", () => {
    render(<ErrorState error={new Error('{"error":"the job store is unavailable"}')} />);
    expect(screen.getByRole('alert').textContent).toBe('Could not load the datathe job store is unavailable');
    expect(screen.getByRole('alert').textContent).not.toContain('{');
    cleanup();
    render(<ErrorState error="Bad Gateway" />);
    expect(screen.getByText('Bad Gateway')).toBeTruthy();
    cleanup();
    render(<ErrorState error={new TypeError('Failed to fetch')} />);
    expect(screen.getByText('Failed to fetch')).toBeTruthy();
  });

  it('shows a refusal (403) as no access with the missing permission, not as a failure', () => {
    for (const error of [
      new Error('{"error":"forbidden: missing permission config:read"}'),
      'permission denied: config:read',
      Object.assign(new Error('nope'), { status: 403 }),
    ]) {
      render(<ErrorState title="Could not load the configuration" error={error} onRetry={() => {}} />);
      expect(screen.queryByRole('alert')).toBeNull();
      const state = screen.getByRole('status');
      expect(state.textContent).toContain("You don't have access to this page");
      expect(state.textContent).not.toContain('Could not load');
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
      if (typeof error === 'string' || error.message !== 'nope') {
        expect(state.textContent).toContain('It needs the permission config:read. Ask an administrator to grant it.');
        expect(state.querySelector('code')?.textContent).toBe('config:read');
      } else {
        expect(state.textContent).toContain('Ask an administrator to give you access.');
      }
      cleanup();
    }
  });

  it('translates the no-access state', () => {
    render(<KitProvider locale="ro"><ErrorState error="forbidden: missing permission logs:read" /></KitProvider>);
    expect(screen.getByRole('status').textContent).toContain('Nu ai acces la această pagină');
    expect(screen.getByRole('status').textContent).toContain('logs:read');
  });

  it('keeps a compact refusal in its place, with the missing permission as the reason', () => {
    render(<ErrorState compact title="Could not save" error="forbidden: missing permission config:write" />);
    expect(screen.getByRole('alert').textContent).toBe('Could not saveMissing permission: config:write');
  });
});

describe('accessDenied', () => {
  it('finds refusals and the permission they name', () => {
    expect(accessDenied('forbidden: missing permission config:read')).toEqual({ permission: 'config:read' });
    expect(accessDenied('permission denied: logs:read')).toEqual({ permission: 'logs:read' });
    expect(accessDenied('{"error":"forbidden: missing permission a:b,c:d"}')).toEqual({ permission: 'a:b, c:d' });
    expect(accessDenied('forbidden')).toEqual({ permission: null });
    expect(accessDenied('HTTP 403 Forbidden')).toEqual({ permission: null });
    expect(accessDenied(Object.assign(new Error('x'), { status: 403 }))).toEqual({ permission: null });
  });

  it('leaves other failures alone', () => {
    for (const error of [undefined, null, '', 'HTTP 500', 'Failed to fetch', 'cannot write the plugins folder /x: permission denied (EACCES)', Object.assign(new Error('x'), { status: 404 })]) {
      expect(accessDenied(error)).toBeNull();
    }
  });
});

