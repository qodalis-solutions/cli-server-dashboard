// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { KitProvider } from '../i18n/text';
import { EmptyState, ErrorState } from './States';

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
});
