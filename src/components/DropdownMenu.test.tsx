// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import DropdownMenu, { MENU_SEPARATOR } from './DropdownMenu';

afterEach(cleanup);

function renderMenu() {
  const edit = vi.fn();
  const archive = vi.fn();
  const remove = vi.fn();
  render(
    <>
      <DropdownMenu
        label="Actions"
        items={[
          { key: 'edit', label: 'Edit', onSelect: edit },
          { key: 'archive', label: 'Archive', onSelect: archive, disabled: true },
          MENU_SEPARATOR,
          { key: 'delete', label: 'Delete', onSelect: remove, tone: 'danger' },
        ]}
      >
        ⋯
      </DropdownMenu>
      <p>Outside</p>
    </>,
  );
  return { button: screen.getByRole('button', { name: 'Actions' }), edit, archive, remove };
}

describe('DropdownMenu', () => {
  it('opens a menu with the keyboard, skips disabled items, runs one with Enter and gives focus back', () => {
    const { button, remove } = renderMenu();
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const menu = screen.getByRole('menu', { name: 'Actions' });
    expect(screen.getAllByRole('menuitem').map(i => i.textContent)).toEqual(['Edit', 'Archive', 'Delete']);
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Edit' }));

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Delete' }));
    // Wraps around
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Edit' }));
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Delete' }));
    fireEvent.keyDown(menu, { key: 'Home' });
    fireEvent.keyDown(menu, { key: 'd' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Delete' }));

    fireEvent.click(document.activeElement!);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('does not run disabled items', () => {
    const { button, archive } = renderMenu();
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    expect(archive).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('closes on Escape, a press outside and scrolling', () => {
    const { button } = renderMenu();
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(button);

    fireEvent.click(button);
    fireEvent.mouseDown(screen.getByText('Outside'));
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(button);
    fireEvent.scroll(window);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens on the last item with ArrowUp', () => {
    const { button } = renderMenu();
    fireEvent.keyDown(button, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Delete' }));
  });
});
