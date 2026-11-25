// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import DataTable from './DataTable';

afterEach(cleanup);

const columns = [{ key: 'name', header: 'Name' }];
const data = [{ name: 'a' }, { name: 'b' }];
const row = (text: string) => screen.getByText(text).closest('tr')!;

describe('DataTable rows', () => {
  it('makes clickable rows focusable, visibly hovered and focused', () => {
    render(<DataTable columns={columns} data={data} keyExtractor={r => r.name} onRowClick={() => {}} />);
    const tr = row('a');
    expect(tr.tabIndex).toBe(0);
    expect(tr.className).toContain('hover:bg-control');
    expect(tr.className).toContain('focus-visible:ring-2');
    expect(tr.className).not.toContain('hover:bg-surface');
  });

  it('opens a row on click, Enter or Space, and ignores other keys', () => {
    const open = vi.fn();
    render(<DataTable columns={columns} data={data} keyExtractor={r => r.name} onRowClick={open} />);
    fireEvent.click(row('a'));
    fireEvent.keyDown(row('b'), { key: 'Enter' });
    fireEvent.keyDown(row('b'), { key: ' ' });
    fireEvent.keyDown(row('b'), { key: 'a' });
    fireEvent.keyDown(row('b'), { key: 'Escape' });
    expect(open.mock.calls).toEqual([[{ name: 'a' }], [{ name: 'b' }], [{ name: 'b' }]]);
  });

  it('leaves Enter to a control inside the row (its own action, not the row\'s)', () => {
    const open = vi.fn();
    const act = vi.fn();
    render(<DataTable
      columns={[{ key: 'name', header: 'Name', render: (r: { name: string }) => <button onClick={act}>{`act ${r.name}`}</button> }]}
      data={data}
      keyExtractor={r => r.name}
      onRowClick={open}
    />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'act a' }), { key: 'Enter' });
    expect(open).not.toHaveBeenCalled();
  });

  it('leaves rows out of the tab order and unhovered without onRowClick', () => {
    render(<DataTable columns={columns} data={data} keyExtractor={r => r.name} />);
    expect(row('a').hasAttribute('tabindex')).toBe(false);
    expect(row('a').className).not.toContain('cursor-pointer');
  });
});

describe('DataTable frame and empty state', () => {
  it('says "No data" without rows, or its emptyMessage', () => {
    render(<DataTable columns={columns} data={[]} keyExtractor={r => r.name} />);
    expect(screen.getByText('No data')).toBeTruthy();
    cleanup();
    render(<DataTable columns={columns} data={[]} keyExtractor={r => r.name} emptyMessage={<p>Nothing yet</p>} />);
    expect(screen.getByText('Nothing yet')).toBeTruthy();
    expect(screen.queryByText('No data')).toBeNull();
  });

  it('has its own card, or none when plain (inside a panel, no double border)', () => {
    const { container } = render(<DataTable columns={columns} data={data} keyExtractor={r => r.name} />);
    expect((container.querySelector('table')!.parentElement as HTMLElement).className).toContain('border-border');
    cleanup();
    const plain = render(<DataTable columns={columns} data={data} keyExtractor={r => r.name} plain />);
    const frame = plain.container.querySelector('table')!.parentElement as HTMLElement;
    expect(frame.className).not.toContain('border');
    expect(frame.className).toContain('overflow-x-auto');
  });
});
