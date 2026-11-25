// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Spinner from './Spinner';

afterEach(cleanup);

describe('Spinner', () => {
  it('is a decorative ring in the current color without a label', () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector('svg')!;
    expect(screen.queryByRole('status')).toBeNull();
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('width')).toBe('14');
    expect(svg.querySelector('path')?.getAttribute('stroke')).toBe('currentColor');
  });

  it('spins unless reduced motion is on, at the given size and with extra classes', () => {
    const { container } = render(<Spinner size={20} className="text-primary" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('class')).toContain('animate-spin');
    expect(svg.getAttribute('class')).toContain('motion-reduce:animate-none');
    expect(svg.getAttribute('class')).toContain('text-primary');
    expect(svg.getAttribute('height')).toBe('20');
  });

  it('is a polite loading status named by its label when it has one', () => {
    render(<Spinner label="Saving…" />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('Saving…');
    expect(screen.getByText('Saving…').className).toBe('sr-only');
  });
});
