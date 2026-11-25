// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { KitProvider } from '../i18n/text';
import kitMessages from '../i18n/messages';
import { LOCALES } from '../i18n/locales';
import ChipList from './ChipList';
import DataTable from './DataTable';

afterEach(cleanup);

const names = (n: number) => Array.from({ length: n }, (_, i) => `item-${i + 1}`);
const more = () => screen.queryByRole('button', { name: /more/ });
const dialog = () => screen.getByRole('dialog');

describe('ChipList', () => {
  it('shows a dash when empty, or the given empty content', () => {
    const { container, rerender } = render(<ChipList items={[]} />);
    expect(container.textContent).toBe('—');
    expect(screen.queryByRole('list')).toBeNull();
    rerender(<ChipList items={[]} empty="No groups" />);
    expect(container.textContent).toBe('No groups');
  });

  it('shows every item and no button under the limit', () => {
    render(<ChipList items={['a', 'b']} />);
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual(['a', 'b']);
    expect(more()).toBeNull();
  });

  it('shows every item and no button at the limit', () => {
    render(<ChipList items={names(3)} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(more()).toBeNull();
  });

  it('shows the first max items and +N more with the hidden count over the limit', () => {
    render(<ChipList items={names(8)} max={2} />);
    expect(screen.getByText('item-1')).toBeTruthy();
    expect(screen.getByText('item-2')).toBeTruthy();
    expect(screen.queryByText('item-3')).toBeNull();
    const button = more()!;
    expect(button.textContent).toBe('+6 more');
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(button.getAttribute('title')).toBe('Show all 8');
  });

  it('defaults to three chips', () => {
    render(<ChipList items={names(4)} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(4); // 3 chips + the button
    expect(more()!.textContent).toBe('+1 more');
  });

  it('opens a dialog listing every item, with the given title', () => {
    render(<ChipList items={names(6)} title="Groups of alice" />);
    fireEvent.click(more()!);
    const d = dialog();
    expect(within(d).getByRole('heading').textContent).toBe('Groups of alice');
    const list = within(d).getByRole('list', { name: 'Groups of alice' });
    expect(within(list).getAllByRole('listitem').map(li => li.textContent)).toEqual(names(6));
    // No search for short lists
    expect(within(d).queryByRole('searchbox')).toBeNull();
  });

  it('titles the dialog with the count when no title is given', () => {
    render(<ChipList items={names(5)} />);
    fireEvent.click(more()!);
    expect(within(dialog()).getByRole('heading').textContent).toBe('All items (5)');
  });

  it('searches long lists by label and tooltip, ignoring case, and says when nothing matches', () => {
    const items = [...names(11), { label: 'admin', title: 'Full access' }];
    render(<ChipList items={items} />);
    fireEvent.click(more()!);
    const search = within(dialog()).getByRole('searchbox', { name: 'Search the list' });
    expect(document.activeElement).toBe(search);
    fireEvent.change(search, { target: { value: 'ITEM-1' } });
    expect(within(dialog()).getAllByRole('listitem').map(li => li.textContent)).toEqual(['item-1', 'item-10', 'item-11']);
    expect(within(dialog()).getByRole('status').textContent).toBe('3 of 12');
    fireEvent.change(search, { target: { value: 'full access' } });
    expect(within(dialog()).getAllByRole('listitem').map(li => li.textContent)).toEqual(['admin']);
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(within(dialog()).queryAllByRole('listitem')).toHaveLength(0);
    expect(within(dialog()).getByText('No matches')).toBeTruthy();
  });

  it('honors a custom search threshold', () => {
    render(<ChipList items={names(4)} max={1} searchThreshold={3} />);
    fireEvent.click(more()!);
    expect(within(dialog()).getByRole('searchbox')).toBeTruthy();
  });

  it('closes with Escape, the close button and the footer button, gives focus back and clears the search', () => {
    render(<ChipList items={names(12)} />);
    const button = more()!;
    button.focus();
    fireEvent.click(button);
    fireEvent.change(within(dialog()).getByRole('searchbox'), { target: { value: 'item-2' } });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(button);

    fireEvent.click(button);
    expect((within(dialog()).getByRole('searchbox') as HTMLInputElement).value).toBe('');
    const closes = within(dialog()).getAllByRole('button', { name: 'Close' });
    expect(closes).toHaveLength(2);
    fireEvent.click(closes[0]);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(button);
    fireEvent.click(within(dialog()).getAllByRole('button', { name: 'Close' })[1]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is reachable and opened from the keyboard: a real button, focus moves into the dialog', () => {
    render(<ChipList items={names(5)} />);
    const button = more()!;
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button); // Enter / Space on a button
    expect(dialog().contains(document.activeElement)).toBe(true);
  });

  it('never triggers a clickable table row: the button, keys on it, the dialog and its links', () => {
    const onRow = vi.fn();
    render(
      <DataTable
        data={[{ id: 1, tags: names(5).map(n => ({ label: n, href: `/t/${n}` })) }]}
        keyExtractor={r => r.id}
        onRowClick={onRow}
        columns={[{ key: 'tags', header: 'Tags', render: r => <ChipList items={r.tags} /> }]}
      />,
    );
    const button = more()!;
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.click(button);
    const d = dialog();
    fireEvent.click(d);
    fireEvent.mouseDown(d);
    fireEvent.click(within(d).getByRole('link', { name: 'item-5' }));
    expect(onRow).not.toHaveBeenCalled();
    // A link closes the dialog
    expect(screen.queryByRole('dialog')).toBeNull();
    // A link chip in the cell does not open the row either
    fireEvent.click(screen.getByRole('link', { name: 'item-1' }));
    expect(onRow).not.toHaveBeenCalled();
    // The rest of the row still does
    fireEvent.click(screen.getByRole('row', { name: /item-1/ }));
    expect(onRow).toHaveBeenCalledTimes(1);
  });

  it('renders custom content, tooltips, styles and links (plain anchors or renderLink)', () => {
    const renderLink = vi.fn(({ href, className, style, children, onClick }) => (
      <a data-router href={href} className={className} style={style} onClick={onClick}>{children}</a>
    ));
    render(
      <ChipList
        max={2}
        renderLink={renderLink}
        chipClassName="my-chip"
        items={[
          { label: 'alpha', render: <strong>Alpha!</strong>, title: 'first' },
          { label: 'beta', href: '/b', style: { color: 'red' } },
          { label: 'gamma', href: '/g', className: 'own' },
        ]}
      />,
    );
    const alpha = screen.getByText('Alpha!');
    expect(alpha.tagName).toBe('STRONG');
    expect(alpha.parentElement!.getAttribute('title')).toBe('first');
    expect(alpha.parentElement!.className).toBe('my-chip');
    const beta = screen.getByRole('link', { name: 'beta' });
    expect(beta.getAttribute('href')).toBe('/b');
    expect(beta.hasAttribute('data-router')).toBe(true);
    expect(beta.style.color).toBe('red');
    expect(beta.className).toContain('my-chip');
    fireEvent.click(more()!);
    const gamma = within(dialog()).getByRole('link', { name: 'gamma' });
    expect(gamma.className).toContain('own');
    expect(renderLink).toHaveBeenCalled();
  });

  it('uses plain anchors without renderLink', () => {
    render(<ChipList items={[{ label: 'docs', href: '/docs' }]} />);
    const link = screen.getByRole('link', { name: 'docs' });
    expect(link.getAttribute('href')).toBe('/docs');
  });

  it('names the list', () => {
    render(<ChipList items={['a']} label="Groups" />);
    expect(screen.getByRole('list', { name: 'Groups' })).toBeTruthy();
  });

  it('speaks the kit language', () => {
    render(<KitProvider locale="fr"><ChipList items={names(14)} /></KitProvider>);
    const button = screen.getByRole('button', { name: '+11 de plus' });
    fireEvent.click(button);
    expect(within(dialog()).getByRole('heading').textContent).toBe('Tous les éléments (14)');
    expect(within(dialog()).getByRole('searchbox', { name: 'Rechercher dans la liste' })).toBeTruthy();
  });

  it('has its texts in every language', () => {
    const keys = ['chipListMore', 'chipListShowAll', 'chipListTitle', 'chipListSearch', 'chipListMatches'] as const;
    for (const { code } of LOCALES) {
      const table = (kitMessages as Record<string, Record<string, string>>)[code];
      for (const key of keys) expect(table?.[key], `${code}.${key}`).toBeTruthy();
    }
  });
});
