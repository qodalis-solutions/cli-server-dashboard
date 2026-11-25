import { useState, type CSSProperties, type ReactNode, type SyntheticEvent } from 'react';
import { useComponentText } from './componentText';
import Modal from './Modal';

/** One item of a `ChipList`: its text, or more. */
export interface ChipListItem {
  /** Shown in the chip and matched by the search of the dialog. */
  label: string;
  /** React key; the label when left out. */
  key?: string;
  /** Content of the chip instead of the label (the search still matches the label). */
  render?: ReactNode;
  /** Tooltip of the chip. */
  title?: string;
  /** Makes the chip a link. */
  href?: string;
  /** Classes of this chip instead of the list's `chipClassName`. */
  className?: string;
  /** Inline style of the chip (a tag's own color). */
  style?: CSSProperties;
}

/** What `renderLink` gets: render a link to `href` with these classes, content and click handler (it closes the dialog). */
export interface ChipListLinkProps {
  href: string;
  className: string;
  title?: string;
  style?: CSSProperties;
  children: ReactNode;
  onClick: (e: SyntheticEvent) => void;
}

export interface ChipListProps {
  items: ReadonlyArray<string | ChipListItem>;
  /** Chips shown before "+N more" (default 3). */
  max?: number;
  /** Title of the dialog with every item ("Groups of alice"); "All items (N)" otherwise. */
  title?: ReactNode;
  /** Accessible name of the list. */
  label?: string;
  /** Classes of each chip (default: a small monospace chip). */
  chipClassName?: string;
  /** Classes of the list in the cell. */
  className?: string;
  /** Shown when there are no items (default `—`). */
  empty?: ReactNode;
  /** The dialog gets a search field above this many items (default 10). */
  searchThreshold?: number;
  /** Renders an item's link, e.g. with the router's `Link`; a plain `<a href>` otherwise. */
  renderLink?: (props: ChipListLinkProps) => ReactNode;
}

export const CHIP_CLASS = 'font-mono text-[11px] bg-control px-1.5 py-0.5 rounded';
const LINK_CLASS = 'hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60';

const normalize = (item: string | ChipListItem): ChipListItem => (typeof item === 'string' ? { label: item } : item);

/** Clicks and keys inside the list never reach a clickable row around it (React events also bubble out of the dialog's portal). */
const stop = (e: SyntheticEvent) => e.stopPropagation();

/**
 * A list of chips that stays short: the first `max` items, then a "+N more" button opening a dialog with all of them
 * (a bottom sheet on phones), with a search field when the list is long. Items are text or custom content, each may be
 * a link. Clicks on the button, a link or inside the dialog do not trigger a clickable table row around it. `—` when empty.
 */
export default function ChipList({
  items, max = 3, title, label, chipClassName = CHIP_CLASS, className = '', empty, searchThreshold = 10, renderLink,
}: ChipListProps) {
  const text = useComponentText();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const all = items.map(normalize);
  const limit = Math.max(0, max);

  if (all.length === 0) return <span className="text-xs text-subtle">{empty ?? '—'}</span>;

  const hidden = all.length - limit;
  const shown = hidden > 0 ? all.slice(0, limit) : all;
  const q = query.trim().toLowerCase();
  const matches = q
    ? all.filter(item => item.label.toLowerCase().includes(q) || (item.title?.toLowerCase().includes(q) ?? false))
    : all;
  const close = () => { setOpen(false); setQuery(''); };

  const chip = (item: ChipListItem, inDialog: boolean) => {
    const cls = item.className ?? chipClassName;
    const content = item.render ?? item.label;
    if (item.href) {
      const onClick = (e: SyntheticEvent) => {
        e.stopPropagation();
        if (inDialog) close();
      };
      const linkClass = `${cls} ${LINK_CLASS}`;
      return renderLink
        ? renderLink({ href: item.href, className: linkClass, title: item.title, style: item.style, children: content, onClick })
        : <a href={item.href} className={linkClass} title={item.title} style={item.style} onClick={onClick}>{content}</a>;
    }
    return <span className={cls} title={item.title} style={item.style}>{content}</span>;
  };

  return (
    <ul className={`flex flex-wrap items-center gap-1 ${className}`} aria-label={label}>
      {shown.map((item, i) => <li key={item.key ?? `${item.label}:${i}`} className="inline-flex max-w-full">{chip(item, false)}</li>)}
      {hidden > 0 && (
        <li className="inline-flex" onClick={stop} onKeyDown={stop}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            title={text('chipListShowAll', { count: all.length })}
            className="text-[11px] font-medium text-accent px-1.5 py-0.5 rounded border border-border/75 bg-surface hover:bg-control-hover whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            {text('chipListMore', { count: hidden })}
          </button>
          <Modal
            open={open}
            onClose={close}
            title={title ?? text('chipListTitle', { count: all.length })}
            actions={<button type="button" onClick={close} className="px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg">{text('dialogClose')}</button>}
          >
            {all.length > searchThreshold && (
              <div className="mb-3 space-y-1">
                <input
                  type="search"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={text('selectSearch')}
                  aria-label={text('chipListSearch')}
                  className="w-full px-3 py-2 text-sm bg-control border border-border rounded-lg text-text placeholder:text-subtle focus:outline-none focus:border-primary/50"
                />
                {q && <p role="status" className="text-xs text-subtle">{text('chipListMatches', { shown: matches.length, total: all.length })}</p>}
              </div>
            )}
            {matches.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5" aria-label={typeof title === 'string' ? title : label}>
                {matches.map((item, i) => <li key={item.key ?? `${item.label}:${i}`} className="inline-flex max-w-full break-all">{chip(item, true)}</li>)}
              </ul>
            ) : (
              <p className="text-xs text-subtle">{text('selectNoMatches')}</p>
            )}
          </Modal>
        </li>
      )}
    </ul>
  );
}
