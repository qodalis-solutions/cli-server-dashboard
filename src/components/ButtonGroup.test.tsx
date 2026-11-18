// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import ButtonGroup from './ButtonGroup';

afterEach(cleanup);

describe('ButtonGroup', () => {
  it('is a labelled group of buttons, one per item, that call their action', () => {
    const run = vi.fn();
    render(<ButtonGroup label="Actions for sync" items={[
      { key: 'run', label: 'Run', onClick: run, tone: 'primary' },
      { key: 'stop', label: 'Stop', onClick: () => {}, tone: 'danger' },
    ]} />);
    const group = screen.getByRole('group', { name: 'Actions for sync' });
    expect(within(group).getAllByRole('button').map(b => b.textContent)).toEqual(['Run', 'Stop']);
    fireEvent.click(within(group).getByRole('button', { name: 'Run' }));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('names icon-only segments and shows the label as a tooltip', () => {
    render(<ButtonGroup label="g" labels="never" items={[{ key: 'run', label: 'Run', icon: <svg />, onClick: () => {} }]} />);
    const button = screen.getByRole('button', { name: 'Run' });
    expect(button.getAttribute('title')).toBe('Run');
  });

  it('disables a segment that is disabled or loading, marking the loading one busy', () => {
    const run = vi.fn();
    render(<ButtonGroup label="g" items={[
      { key: 'run', label: 'Run', onClick: run, loading: true },
      { key: 'stop', label: 'Stop', onClick: () => {}, disabled: true },
      { key: 'pause', label: 'Pause', onClick: () => {} },
    ]} />);
    const runButton = screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement;
    expect(runButton.disabled).toBe(true);
    expect(runButton.getAttribute('aria-busy')).toBe('true');
    expect((screen.getByRole('button', { name: 'Stop' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Pause' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(runButton);
    expect(run).not.toHaveBeenCalled();
  });

  it('renders nothing without items', () => {
    const { container } = render(<ButtonGroup label="g" items={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('puts the overflow actions in a "More actions" menu segment at the end', () => {
    const remove = vi.fn();
    render(<ButtonGroup label="Actions for run 7" labels="never" items={[{ key: 'logs', label: 'Logs', onClick: () => {} }]}
      overflow={[{ key: 'delete', label: 'Delete', tone: 'danger', onSelect: remove }]} />);
    const group = screen.getByRole('group', { name: 'Actions for run 7' });
    const more = within(group).getByRole('button', { name: 'More actions' });
    expect(within(group).getAllByRole('button').at(-1)).toBe(more);
    expect(more.getAttribute('aria-haspopup')).toBe('menu');
    fireEvent.click(more);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('shows only the menu when every action overflows, and names segments by ariaLabel', () => {
    render(<ButtonGroup label="g" items={[{ key: 'revoke', label: 'Revoke', ariaLabel: 'Revoke ci-token', onClick: () => {} }]} />);
    expect(screen.getByRole('button', { name: 'Revoke ci-token' }).textContent).toBe('Revoke');
    cleanup();
    render(<ButtonGroup label="g" items={[]} overflow={[{ key: 'x', label: 'X', onSelect: () => {} }]} />);
    expect(screen.getByRole('button', { name: 'More actions' })).toBeTruthy();
  });

  it('marks toggle segments pressed', () => {
    render(<ButtonGroup label="g" items={[{ key: 'pause', label: 'Pause', pressed: true, onClick: () => {} }, { key: 'clear', label: 'Clear', onClick: () => {} }]} />);
    expect(screen.getByRole('button', { name: 'Pause' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Clear' }).getAttribute('aria-pressed')).toBeNull();
  });
});
