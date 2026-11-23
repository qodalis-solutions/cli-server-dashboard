// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import Tooltip from './Tooltip';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderTooltip(content = vi.fn(() => 'Details')) {
  render(
    <Tooltip content={content} openDelay={200}>
      {describedBy => <button aria-describedby={describedBy}>Bar</button>}
    </Tooltip>,
  );
  return { button: screen.getByRole('button', { name: 'Bar' }), content };
}

describe('Tooltip', () => {
  it('opens after the hover delay, describes its trigger and closes when the pointer leaves', () => {
    vi.useFakeTimers();
    const { button, content } = renderTooltip();
    fireEvent.pointerEnter(button.parentElement!);
    act(() => { vi.advanceTimersByTime(150); });
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(content).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(100); });
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.textContent).toBe('Details');
    expect(button.getAttribute('aria-describedby')).toBe(tooltip.id);
    fireEvent.pointerLeave(button.parentElement!);
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(button.getAttribute('aria-describedby')).toBeNull();
  });

  it('does not open when the pointer leaves before the delay', () => {
    vi.useFakeTimers();
    const { button } = renderTooltip();
    fireEvent.pointerEnter(button.parentElement!);
    fireEvent.pointerLeave(button.parentElement!);
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens at once on keyboard focus and closes on Escape or blur', () => {
    const { button } = renderTooltip();
    fireEvent.focus(button);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(button);
    fireEvent.blur(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens on a long press, and the tap ending it is not a click', () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    render(
      <Tooltip content={() => 'Details'} longPress={400}>
        {() => <button onClick={onClick}>Bar</button>}
      </Tooltip>,
    );
    const button = screen.getByRole('button');
    fireEvent.touchStart(button);
    act(() => { vi.advanceTimersByTime(450); });
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.touchEnd(button);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
