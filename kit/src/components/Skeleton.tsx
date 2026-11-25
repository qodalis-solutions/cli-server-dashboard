import type { CSSProperties, ReactNode } from 'react';
import { useKitText } from '../i18n/text';

/**
 * Placeholders shaped like the content that is loading, so the reader sees that something will
 * appear (and where) instead of a blank area or a line of text. Every helper is one loading status
 * for assistive technology (role="status", announced politely with a translated label); the bars
 * themselves are hidden from it. The pulse stops under reduced motion.
 */

/** One placeholder bar or block; size it with classes (`h-4 w-1/2`) or `style`. */
export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden className={`rounded bg-control ${className}`} style={style} />;
}

/** The loading status around placeholders: announced once, pulsing unless reduced motion is on. */
export function SkeletonGroup({ label, className = '', children }: { label?: string; className?: string; children: ReactNode }) {
  const { t } = useKitText();
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={`animate-pulse motion-reduce:animate-none ${className}`}>
      <span className="sr-only">{label ?? t('loading')}</span>
      {children}
    </div>
  );
}

// Varied widths so lines look like text, not a grid of identical bars.
const LINE_WIDTHS = ['100%', '92%', '96%', '80%', '88%', '70%'];

/** Lines of text; the last one shorter, as a paragraph ends. */
export function SkeletonText({ lines = 3, label, className = '' }: { lines?: number; label?: string; className?: string }) {
  return (
    <SkeletonGroup label={label} className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-3.5" style={{ width: i === lines - 1 && lines > 1 ? '60%' : LINE_WIDTHS[i % LINE_WIDTHS.length] }} />
      ))}
    </SkeletonGroup>
  );
}

function StatCardBars() {
  return (
    <>
      {/* Rows the height of StatCard's lines (11px label, 2xl value, 11px note), so the card does not jump */}
      <div className="h-4 flex items-center"><Skeleton className="h-2.5 w-20" /></div>
      <div className="h-8 mt-1 flex items-center"><Skeleton className="h-6 w-16" /></div>
      <div className="h-4 mt-0.5 flex items-center"><Skeleton className="h-2.5 w-24" /></div>
    </>
  );
}

const STAT_CARD = 'flex-1 min-w-[140px] bg-surface border border-border rounded-xl p-4';

/**
 * Cards shaped like `StatCard` (label, value), in their own wrapping row, or with `inRow` as items of the
 * enclosing row (next to real cards).
 */
export function SkeletonStatCards({ count = 4, label, inRow = false, className = '' }: { count?: number; label?: string; inRow?: boolean; className?: string }) {
  return (
    <SkeletonGroup label={label} className={`${inRow ? 'contents' : 'flex flex-wrap gap-4'} ${className}`}>
      {Array.from({ length: count }, (_, i) => <div key={i} className={STAT_CARD}><StatCardBars /></div>)}
    </SkeletonGroup>
  );
}

/** One card shaped like `StatCard`, to sit in a row of real cards. */
export function SkeletonStatCard({ label, className = '' }: { label?: string; className?: string }) {
  return <SkeletonGroup label={label} className={`${STAT_CARD} ${className}`}><StatCardBars /></SkeletonGroup>;
}

/** A table shaped like `DataTable`: a header and `rows` rows of `columns` cells. */
export function SkeletonTable({ rows = 5, columns = 4, label, plain = false, className = '' }: {
  rows?: number;
  columns?: number;
  label?: string;
  /** Without the card (border, background), inside a panel that has them (as `DataTable`'s `plain`). */
  plain?: boolean;
  className?: string;
}) {
  const cells = Array.from({ length: columns }, (_, c) => c);
  return (
    <SkeletonGroup label={label} className={`${plain ? '' : 'bg-surface border border-border rounded-xl'} overflow-hidden ${className}`}>
      <div className="flex gap-4 px-4 py-3.5 border-b border-border/75">
        {cells.map(c => <Skeleton key={c} className="h-2.5 flex-1" style={{ maxWidth: c === 0 ? '7rem' : '5rem' }} />)}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4 px-4 py-3.5 border-b border-border/50 last:border-0">
          {cells.map(c => <Skeleton key={c} className="h-3.5 flex-1" style={{ maxWidth: c === 0 ? '12rem' : LINE_WIDTHS[(r + c) % LINE_WIDTHS.length] }} />)}
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** A card shaped like `ChartCard` with a plot area of `height` pixels, so the chart replaces it without a jump. */
export function SkeletonChartCard({ height = 160, label, className = '' }: { height?: number; label?: string; className?: string }) {
  return (
    <SkeletonGroup label={label} className={`bg-surface border border-border rounded-xl p-4 ${className}`}>
      <Skeleton className="h-3.5 w-32" />
      <Skeleton className="h-2.5 w-48 mt-1.5 mb-3" />
      <Skeleton className="w-full rounded-md" style={{ height }} />
    </SkeletonGroup>
  );
}

/** A list of `items` rows: a title line and a shorter detail line each. */
export function SkeletonList({ items = 4, label, className = '' }: { items?: number; label?: string; className?: string }) {
  return (
    <SkeletonGroup label={label} className={`space-y-3 ${className}`}>
      {Array.from({ length: items }, (_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3.5" style={{ width: LINE_WIDTHS[(i + 2) % LINE_WIDTHS.length] }} />
          <Skeleton className="h-2.5 w-1/3" />
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** A whole page: a header (title, subtitle) and a table, while the page itself is loading. */
export function SkeletonPage({ label, columns = 4, rows = 6 }: { label?: string; columns?: number; rows?: number }) {
  return (
    <SkeletonGroup label={label} className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3.5 w-72 max-w-full" />
      </div>
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="flex gap-4 px-4 py-3.5 border-b border-border/75">
          {Array.from({ length: columns }, (_, c) => <Skeleton key={c} className="h-2.5 flex-1 max-w-[6rem]" />)}
        </div>
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex gap-4 px-4 py-3.5 border-b border-border/50 last:border-0">
            {Array.from({ length: columns }, (_, c) => <Skeleton key={c} className="h-3.5 flex-1" style={{ maxWidth: LINE_WIDTHS[(r + c) % LINE_WIDTHS.length] }} />)}
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}
