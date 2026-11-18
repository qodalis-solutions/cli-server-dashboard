// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
import { useConfirm } from './useConfirm';

afterEach(cleanup);

function WithTrigger({ closeOnEscape = true, closeOnBackdrop = true }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit job"
        closeOnEscape={closeOnEscape}
        closeOnBackdrop={closeOnBackdrop}
        actions={<button onClick={() => setOpen(false)}>Save</button>}
      >
        <input aria-label="Name" />
      </Modal>
    </>
  );
}

function openIt() {
  const trigger = screen.getByRole('button', { name: 'Open' });
  trigger.focus();
  fireEvent.click(trigger);
  return { trigger, dialog: screen.getByRole('dialog', { name: 'Edit job' }) };
}

describe('Modal', () => {
  it('is a labelled modal dialog that takes focus, locks the page scroll and keeps Tab inside', () => {
    render(<WithTrigger />);
    const { dialog } = openIt();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.body.style.overflow).toBe('hidden');
    const name = screen.getByRole('textbox', { name: 'Name' });
    expect(document.activeElement).toBe(name);

    // Last control (Save) → first (Close), and back with Shift+Tab
    const save = screen.getByRole('button', { name: 'Save' });
    const close = screen.getByRole('button', { name: 'Close' });
    save.focus();
    fireEvent.keyDown(save, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(save);
  });

  it('closes on Escape and gives focus back to the trigger', () => {
    render(<WithTrigger />);
    const { trigger } = openIt();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe('');
  });

  it('closes on the backdrop and the close button, unless turned off', () => {
    const { unmount } = render(<WithTrigger />);
    let { dialog } = openIt();
    const backdrop = dialog.parentElement!;
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    expect(screen.queryByRole('dialog')).toBeNull();
    ({ dialog } = openIt());
    // A press that starts inside the dialog does not close it
    fireEvent.mouseDown(dialog);
    fireEvent.click(dialog.parentElement!);
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    unmount();

    render(<WithTrigger closeOnEscape={false} closeOnBackdrop={false} />);
    ({ dialog } = openIt());
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    fireEvent.mouseDown(dialog.parentElement!);
    fireEvent.click(dialog.parentElement!);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('leaves Escape to a handler inside that took it (an open select)', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="T">
        <input aria-label="Inner" onKeyDown={e => { if (e.key === 'Escape') e.preventDefault(); }} />
      </Modal>,
    );
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Inner' }), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('ConfirmDialog', () => {
  it('shows a loading state while the async confirm runs, and cannot be dismissed meanwhile', async () => {
    let finish!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const onCancel = vi.fn();
    render(<ConfirmDialog open tone="danger" title="Delete run?" message="It goes for good." confirmLabel="Delete" onConfirm={onConfirm} onCancel={onCancel} />);
    const dialog = screen.getByRole('dialog', { name: 'Delete run?' });
    expect(dialog.textContent).toContain('It goes for good.');
    // Dangerous: Cancel has focus first
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const busy = screen.getByRole('button', { name: 'Working…' }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();

    await act(async () => { finish(); });
    expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps the dialog open with the error when the confirm fails', async () => {
    const onConfirm = vi.fn(() => Promise.reject(new Error('Server said no')));
    render(<ConfirmDialog open title="Revoke?" message="Sure?" onConfirm={onConfirm} onCancel={vi.fn()} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirm' })); });
    expect(screen.getByRole('alert').textContent).toBe('Server said no');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('useConfirm resolves true after the action and false on cancel', async () => {
    const action = vi.fn(async () => {});
    const results: boolean[] = [];
    function Page() {
      const { confirm, dialog } = useConfirm();
      return (
        <>
          <button onClick={() => void confirm({ title: 'Go?', message: 'Really?', onConfirm: action }).then(ok => results.push(ok))}>Ask</button>
          {dialog}
        </>
      );
    }
    render(<Page />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirm' })); });
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); });
    expect(results).toEqual([true, false]);
    expect(action).toHaveBeenCalledTimes(1);
  });
});
