// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { KitProvider } from '../i18n/text';
import {
  Skeleton,
  SkeletonChartCard,
  SkeletonGroup,
  SkeletonList,
  SkeletonPage,
  SkeletonStatCard,
  SkeletonStatCards,
  SkeletonTable,
  SkeletonText,
} from './Skeleton';

afterEach(cleanup);

/** The placeholder bars inside a loading status (hidden from assistive technology). */
const bars = (status: HTMLElement) => status.querySelectorAll('[aria-hidden="true"]');

describe('Skeleton', () => {
  it('is a decorative bar on the theme control color, sized by classes or style', () => {
    const { container } = render(<Skeleton className="h-4 w-1/2" style={{ maxWidth: '5rem' }} />);
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.getAttribute('aria-hidden')).toBe('true');
    expect(bar.className).toContain('bg-control');
    expect(bar.className).toContain('h-4 w-1/2');
    expect(bar.style.maxWidth).toBe('5rem');
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('SkeletonGroup', () => {
  it('is one polite, busy loading status that pulses unless reduced motion is on', () => {
    render(<SkeletonGroup className="space-y-2"><Skeleton /></SkeletonGroup>);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(status.className).toContain('animate-pulse');
    expect(status.className).toContain('motion-reduce:animate-none');
    expect(status.className).toContain('space-y-2');
  });

  it('names itself "Loading…" in the KitProvider language (English without one), or by its label', () => {
    render(<SkeletonGroup><Skeleton /></SkeletonGroup>);
    expect(screen.getByRole('status').textContent).toBe('Loading…');
    cleanup();
    for (const [locale, text] of [['fr', 'Chargement…'], ['ja', '読み込み中…'], ['ro', 'Se încarcă…'], ['xx', 'Loading…']]) {
      render(<KitProvider locale={locale}><SkeletonGroup><Skeleton /></SkeletonGroup></KitProvider>);
      expect(screen.getByRole('status').textContent).toBe(text);
      cleanup();
    }
    render(<SkeletonGroup label="Loading jobs…"><Skeleton /></SkeletonGroup>);
    expect(screen.getByRole('status').textContent).toBe('Loading jobs…');
    expect(screen.getByText('Loading jobs…').className).toBe('sr-only');
  });
});

describe('SkeletonText', () => {
  it('draws the given lines, the last shorter like the end of a paragraph', () => {
    render(<SkeletonText lines={4} />);
    const lines = [...bars(screen.getByRole('status'))] as HTMLElement[];
    expect(lines).toHaveLength(4);
    expect(lines[3].style.width).toBe('60%');
    expect(lines.slice(0, 3).every(l => l.style.width !== '60%')).toBe(true);
  });

  it('draws one full-width line for a single line, three by default', () => {
    render(<SkeletonText lines={1} />);
    expect((bars(screen.getByRole('status'))[0] as HTMLElement).style.width).toBe('100%');
    cleanup();
    render(<SkeletonText />);
    expect(bars(screen.getByRole('status'))).toHaveLength(3);
  });
});

describe('SkeletonStatCards', () => {
  it('draws stat cards (label, value, note) in their own wrapping row', () => {
    render(<SkeletonStatCards count={3} />);
    const status = screen.getByRole('status');
    expect(status.className).toContain('flex flex-wrap');
    expect(status.querySelectorAll('.rounded-xl')).toHaveLength(3);
    expect(bars(status)).toHaveLength(9);
  });

  it('with inRow, its cards are items of the enclosing row (no row of its own)', () => {
    render(<div className="flex"><SkeletonStatCards count={2} inRow /></div>);
    const status = screen.getByRole('status');
    expect(status.className).toContain('contents');
    expect(status.className).not.toContain('flex');
  });

  it('SkeletonStatCard is one card sized like StatCard, a status of its own', () => {
    render(<SkeletonStatCard label="Active jobs" />);
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('Active jobs');
    expect(status.className).toContain('min-w-[140px]');
    expect(bars(status)).toHaveLength(3);
  });
});

describe('SkeletonTable', () => {
  it('draws a header and the rows, each with the real column count', () => {
    const { container } = render(<SkeletonTable rows={3} columns={5} />);
    const rows = container.querySelectorAll('[role=status] > div');
    expect(rows).toHaveLength(4);
    rows.forEach(row => expect(row.children).toHaveLength(5));
  });

  it('has the card of DataTable, or none when plain (inside a panel)', () => {
    render(<SkeletonTable />);
    expect(screen.getByRole('status').className).toContain('border-border');
    cleanup();
    render(<SkeletonTable plain />);
    const status = screen.getByRole('status');
    expect(status.className).not.toContain('border-border');
    expect(status.className).not.toContain('bg-surface');
  });
});

describe('SkeletonChartCard', () => {
  it('holds a plot area of the chart height, so the chart replaces it without a jump', () => {
    const { container } = render(<SkeletonChartCard height={210} label="Runs" />);
    expect(container.querySelector('[style*="height: 210px"]')).not.toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Runs');
  });

  it('defaults to a 160px plot', () => {
    const { container } = render(<SkeletonChartCard />);
    expect(container.querySelector('[style*="height: 160px"]')).not.toBeNull();
  });
});

describe('SkeletonList and SkeletonPage', () => {
  it('a list draws a title and a detail line per item', () => {
    render(<SkeletonList items={5} />);
    expect(bars(screen.getByRole('status'))).toHaveLength(10);
  });

  it('a page draws a header and a table of the given size, as one status', () => {
    const { container } = render(<SkeletonPage columns={3} rows={2} label="Loading Jobs…" />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toBe('Loading Jobs…');
    const tableRows = container.querySelectorAll('.rounded-xl > div');
    expect(tableRows).toHaveLength(3);
    tableRows.forEach(row => expect(row.children).toHaveLength(3));
  });
});
