// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { KitProvider } from '../i18n/text';
import { EmptyState, ErrorState } from './States';
import Spinner from './Spinner';
import DataTable from './DataTable';
import {
  SkeletonChartCard,
  SkeletonList,
  SkeletonPage,
  SkeletonStatCards,
  SkeletonTable,
  SkeletonText,
} from './Skeleton';

afterEach(cleanup);

describe('Skeletons', () => {
  it('are one polite loading status with a translated label, the bars hidden from assistive technology', () => {
    render(<SkeletonText lines={4} />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(status.textContent).toBe('Loading…');
    expect(status.className).toContain('motion-reduce:animate-none');
    expect(status.querySelectorAll('[aria-hidden]')).toHaveLength(4);
  });

  it('speak the language of the KitProvider, or take a label', () => {
    render(<KitProvider locale="fr"><SkeletonList /><SkeletonTable label="Jobs" /></KitProvider>);
    expect(screen.getAllByRole('status').map(s => s.textContent)).toEqual(['Chargement…', 'Jobs']);
  });

  it('draw a table with the given rows and columns (plus the header)', () => {
    const { container } = render(<SkeletonTable rows={3} columns={5} />);
    const rows = container.querySelectorAll('[role=status] > div');
    expect(rows).toHaveLength(4);
    rows.forEach(row => expect(row.children).toHaveLength(5));
  });

  it('draw stat cards, a chart card of the chart height and a page', () => {
    const { container } = render(<>
      <SkeletonStatCards count={3} />
      <SkeletonChartCard height={210} />
      <SkeletonPage />
    </>);
    expect(container.querySelectorAll('.rounded-xl.p-4')).toHaveLength(4);
    expect(container.querySelector('[style*="height: 210px"]')).not.toBeNull();
    expect(screen.getAllByRole('status')).toHaveLength(3);
  });
});

describe('Spinner', () => {
  it('is decorative without a label and a status with one', () => {
    const { container } = render(<Spinner />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    cleanup();
    render(<Spinner label="Saving" />);
    expect(screen.getByRole('status').textContent).toBe('Saving');
  });
});

describe('EmptyState', () => {
  it('shows the message (No data by default), a detail and an action', () => {
    render(<EmptyState />);
    expect(screen.getByText('No data')).toBeTruthy();
    cleanup();
    render(<EmptyState message="No events match" detail="Clear the filter" action={<button>Clear</button>} />);
    expect(screen.getByText('No events match')).toBeTruthy();
    expect(screen.getByText('Clear the filter')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy();
  });
});

describe('ErrorState', () => {
  it('is an alert with the title, the reason and a Retry button that calls onRetry', () => {
    const retry = vi.fn();
    render(<ErrorState title="Failed to load commands" error={new Error('HTTP 500')} onRetry={retry} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Failed to load commands');
    expect(alert.textContent).toContain('HTTP 500');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('has a default title, no reason line for an empty error and no button without onRetry', () => {
    render(<KitProvider locale="de"><ErrorState error="" /></KitProvider>);
    expect(screen.getByRole('alert').textContent).toBe('Die Daten konnten nicht geladen werden');
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('DataTable', () => {
  const columns = [{ key: 'name', header: 'Name' }];
  const data = [{ name: 'a' }, { name: 'b' }];

  it('makes clickable rows focusable and opens them with Enter or Space', () => {
    const open = vi.fn();
    render(<DataTable columns={columns} data={data} keyExtractor={r => r.name} onRowClick={open} />);
    const row = screen.getByText('b').closest('tr')!;
    expect(row.tabIndex).toBe(0);
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    fireEvent.keyDown(row, { key: 'a' });
    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledWith({ name: 'b' });
  });

  it('leaves rows out of the tab order without onRowClick and shows the empty message', () => {
    render(<DataTable columns={columns} data={data} keyExtractor={r => r.name} />);
    expect(screen.getByText('a').closest('tr')!.hasAttribute('tabindex')).toBe(false);
    cleanup();
    render(<DataTable columns={columns} data={[]} keyExtractor={r => r.name} emptyMessage={<p>Nothing yet</p>} />);
    expect(screen.getByText('Nothing yet')).toBeTruthy();
  });
});
