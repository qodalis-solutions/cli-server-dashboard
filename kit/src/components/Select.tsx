import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useComponentText } from './componentText';
import {
  firstEnabled, isTypeaheadKey, lastEnabled, nextEnabled, useDismiss, usePopoverPosition, useTypeahead,
} from './overlay';

export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
  /** A second, smaller line under the label. */
  description?: string;
  /** Shown before the label (a color dot, an icon). */
  icon?: ReactNode;
  disabled?: boolean;
}

export type SelectSize = 'sm' | 'md';
export type SelectWidth = 'responsive' | 'full' | 'auto';

const WIDTH: Record<SelectWidth, string> = { responsive: 'w-full sm:w-auto', full: 'w-full', auto: 'w-auto' };

interface BaseProps<V extends string> {
  options: readonly SelectOption<V>[];
  /**
   * Accessible name. Leave it out when a `<label>` wraps the select or points at its `id`; the trigger is a button,
   * so either names it.
   */
  label?: string;
  id?: string;
  /** Shown while nothing is selected. */
  placeholder?: string;
  /** A search field above the options; by default only for lists of more than 10. */
  searchable?: boolean;
  disabled?: boolean;
  /** `sm`: the compact filter controls (default); `md`: form fields. */
  size?: SelectSize;
  /** `responsive` (default): full width on phones, from `sm` up as wide as its label; `full`; `auto`: as wide as its label. */
  width?: SelectWidth;
  className?: string;
}

export interface SelectProps<V extends string> extends BaseProps<V> {
  value: V | null;
  onChange: (value: V) => void;
  /** Makes it clearable: a clear button while a value is selected. */
  onClear?: () => void;
}

export interface MultiSelectProps<V extends string> extends BaseProps<V> {
  value: readonly V[];
  onChange: (value: V[]) => void;
  /** A clear button while values are selected (selects none). */
  clearable?: boolean;
  /** Selected values shown as chips in the button before the rest is counted (default 2). */
  maxChips?: number;
}

const TRIGGER_SIZE: Record<SelectSize, string> = {
  sm: 'min-h-11 sm:min-h-0 px-2.5 py-1.5 text-xs',
  md: 'min-h-11 sm:min-h-0 px-3 py-2 text-sm',
};

/**
 * A themed dropdown for one value: an ARIA combobox (`role="combobox"` on the button) with a listbox rendered at the
 * end of the page (tables and dialogs do not clip it), below the button or above it when there is no room below.
 * Keyboard: arrows, Home/End, type-ahead, Enter or Space to choose, Escape or Tab to close.
 */
export function Select<V extends string>(props: SelectProps<V>) {
  const { value, onChange, onClear, ...rest } = props;
  return (
    <Listbox
      {...rest}
      multiple={false}
      selected={value === null ? [] : [value]}
      onPick={v => onChange(v)}
      onClear={onClear}
    />
  );
}

/** Like Select, for several values: options with checkmarks, the selection as chips; it stays open while picking. */
export function MultiSelect<V extends string>(props: MultiSelectProps<V>) {
  const { value, onChange, clearable, maxChips = 2, ...rest } = props;
  return (
    <Listbox
      {...rest}
      multiple
      maxChips={maxChips}
      selected={value}
      onPick={v => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v])}
      onClear={clearable ? () => onChange([]) : undefined}
    />
  );
}

export default Select;

interface ListboxProps<V extends string> extends BaseProps<V> {
  multiple: boolean;
  selected: readonly V[];
  onPick: (value: V) => void;
  onClear?: () => void;
  maxChips?: number;
}

function Listbox<V extends string>({
  options, label, id, placeholder, searchable, disabled = false, size = 'sm', width = 'responsive', className = '',
  multiple, selected, onPick, onClear, maxChips = 2,
}: ListboxProps<V>) {
  const text = useComponentText();
  const listId = useId();
  const optionId = (i: number) => `${listId}-o${i}`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [query, setQuery] = useState('');
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const typeahead = useTypeahead();
  const withSearch = searchable ?? options.length > 10;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)) : options;
  }, [options, query]);
  const disabledFlags = useMemo(() => shown.map(o => !!o.disabled), [shown]);
  const labels = useMemo(() => shown.map(o => o.label), [shown]);
  const position = usePopoverPosition(open, trigger, panel);

  const close = (focusTrigger = true) => {
    setOpen(false);
    setQuery('');
    if (focusTrigger) trigger?.focus();
  };
  useDismiss(open, () => [trigger, panel.current], () => close(false), () => close(false));

  function openAt(index?: number) {
    if (disabled) return;
    const current = options.findIndex(o => selected.includes(o.value) && !o.disabled);
    const flags = options.map(o => !!o.disabled);
    setQuery('');
    setActive(index ?? (current >= 0 ? current : firstEnabled(flags)));
    setOpen(true);
  }

  // The search field takes focus when the list opens
  useEffect(() => {
    if (open && withSearch) search.current?.focus();
  }, [open, withSearch]);

  // The active option stays in view
  useEffect(() => {
    if (!open || active < 0) return;
    document.getElementById(`${listId}-o${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active, listId]);

  function choose(index: number) {
    const option = shown[index];
    if (!option || option.disabled) return;
    onPick(option.value);
    if (!multiple) close();
  }

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    const inSearch = e.currentTarget === search.current;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openAt();
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        const flags = options.map(o => !!o.disabled);
        openAt(e.key === 'Home' ? firstEnabled(flags) : lastEnabled(flags));
      } else if (isTypeaheadKey(e)) {
        // Like a native select: typing picks the matching option without opening the list
        const current = options.findIndex(o => selected.includes(o.value));
        const next = typeahead(e.key, options.map(o => o.label), options.map(o => !!o.disabled), current);
        if (next !== current && next >= 0) {
          if (multiple) openAt(next);
          else onPick(options[next].value);
        }
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive(a => (a < 0 ? firstEnabled(disabledFlags) : nextEnabled(disabledFlags, a, 1)));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (e.altKey) { if (!multiple) choose(active); close(); break; }
        setActive(a => (a < 0 ? lastEnabled(disabledFlags) : nextEnabled(disabledFlags, a, -1)));
        break;
      case 'Home':
      case 'End':
        if (inSearch && !e.ctrlKey) break;
        e.preventDefault();
        setActive(e.key === 'Home' ? firstEnabled(disabledFlags) : lastEnabled(disabledFlags));
        break;
      case 'PageDown':
      case 'PageUp': {
        e.preventDefault();
        let next = active;
        for (let n = 0; n < 10; n++) next = nextEnabled(disabledFlags, next, e.key === 'PageDown' ? 1 : -1);
        setActive(next);
        break;
      }
      case 'Enter':
        e.preventDefault();
        choose(active);
        break;
      case ' ':
        if (inSearch) break;
        e.preventDefault();
        choose(active);
        break;
      case 'Escape':
        // Handled here: a dialog around the select stays open
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case 'Tab':
        if (inSearch) {
          e.preventDefault();
          close();
        } else {
          close(false);
        }
        break;
      default:
        if (!inSearch && isTypeaheadKey(e)) setActive(a => typeahead(e.key, labels, disabledFlags, a));
    }
  }

  const selectedOptions = options.filter(o => selected.includes(o.value));
  const hasValue = selectedOptions.length > 0;
  const clearable = !!onClear && hasValue && !disabled;

  return (
    <div className={`relative inline-flex max-w-full ${WIDTH[width]} ${className}`}>
      <button
        ref={setTrigger}
        id={id}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && !withSearch && active >= 0 ? optionId(active) : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openAt())}
        onKeyDown={onKeyDown}
        className={`flex-1 min-w-0 inline-flex items-center gap-2 bg-control border rounded-lg text-left text-text transition-colors hover:bg-control-hover focus:outline-none focus-visible:border-primary disabled:opacity-50 disabled:cursor-not-allowed ${
          open ? 'border-primary' : 'border-border/75'
        } ${TRIGGER_SIZE[size]} ${clearable ? 'pr-16 sm:pr-12' : 'pr-7'}`}
      >
        <span className="flex-1 min-w-0 flex items-center gap-1.5 truncate">
          {!hasValue && <span className="truncate text-subtle">{placeholder ?? '—'}</span>}
          {hasValue && !multiple && (
            <>
              {selectedOptions[0].icon && <span aria-hidden className="inline-flex shrink-0">{selectedOptions[0].icon}</span>}
              <span className="truncate">{selectedOptions[0].label}</span>
            </>
          )}
          {hasValue && multiple && (
            <>
              {selectedOptions.slice(0, maxChips).map(o => (
                <span key={o.value} className="inline-flex items-center gap-1 max-w-[8rem] px-1.5 py-px rounded bg-primary/15 text-accent text-[11px] leading-4">
                  {o.icon && <span aria-hidden className="inline-flex shrink-0">{o.icon}</span>}
                  <span className="truncate">{o.label}</span>
                </span>
              ))}
              {selectedOptions.length > maxChips && (
                <span className="shrink-0 text-[11px] text-muted tabular-nums">{text('selectMore', { count: selectedOptions.length - maxChips })}</span>
              )}
            </>
          )}
        </span>
      </button>
      <Chevron open={open} />
      {clearable && (
        <button
          type="button"
          aria-label={text('selectClear')}
          title={text('selectClear')}
          onClick={() => { onClear?.(); trigger?.focus(); }}
          className="absolute right-6 sm:right-5 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-5 sm:h-5 inline-flex items-center justify-center rounded text-subtle hover:text-text hover:bg-control-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 2l6 6M8 2l-6 6" />
          </svg>
        </button>
      )}
      {open && createPortal(
        <div
          ref={panel}
          data-placement={position?.placement}
          style={position
            ? { left: position.left, top: position.top, minWidth: position.minWidth, maxHeight: position.maxHeight }
            : { left: 0, top: 0, visibility: 'hidden' }}
          className="fixed z-[60] flex flex-col max-w-[min(24rem,calc(100vw-1rem))] rounded-lg border border-border bg-popover shadow-xl overflow-hidden motion-safe:animate-pop-in"
        >
          {withSearch && (
            <div className="p-1.5 border-b border-border/75">
              <input
                ref={search}
                type="text"
                role="combobox"
                aria-label={label ? `${label}: ${text('selectSearch')}` : text('selectSearch')}
                aria-autocomplete="list"
                aria-expanded
                aria-controls={listId}
                aria-activedescendant={active >= 0 && active < shown.length ? optionId(active) : undefined}
                placeholder={text('selectSearch')}
                value={query}
                onChange={e => {
                  const q = e.target.value;
                  setQuery(q);
                  const lower = q.trim().toLowerCase();
                  const flags = options
                    .filter(o => !lower || o.label.toLowerCase().includes(lower) || o.value.toLowerCase().includes(lower))
                    .map(o => !!o.disabled);
                  setActive(firstEnabled(flags));
                }}
                onKeyDown={onKeyDown}
                className="w-full min-h-11 sm:min-h-0 px-2.5 py-1.5 text-base sm:text-xs bg-control border border-border/75 rounded-md text-text placeholder:text-subtle focus:outline-none focus:border-primary"
              />
            </div>
          )}
          <ul
            ref={list}
            id={listId}
            role="listbox"
            aria-label={label}
            aria-multiselectable={multiple || undefined}
            tabIndex={-1}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-1"
          >
            {shown.length === 0 && <li role="presentation" className="px-2.5 py-2 text-xs text-subtle">{text('selectNoMatches')}</li>}
            {shown.map((o, i) => {
              const isSelected = selected.includes(o.value);
              return (
                <li
                  key={o.value}
                  id={optionId(i)}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={o.disabled || undefined}
                  onMouseMove={() => { if (!o.disabled && active !== i) setActive(i); }}
                  // Keeps focus on the button or the search field
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => choose(i)}
                  className={`flex items-center gap-2 min-h-11 sm:min-h-8 px-2.5 py-1 rounded-md text-sm sm:text-xs select-none ${
                    o.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                  } ${i === active ? 'bg-control-hover' : ''} ${isSelected ? 'text-accent font-medium' : 'text-text'}`}
                >
                  <Check checked={isSelected} box={multiple} />
                  {o.icon && <span aria-hidden className="inline-flex shrink-0">{o.icon}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.label}</span>
                    {o.description && <span className="block truncate text-[11px] font-normal text-subtle">{o.description}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" className={`absolute right-2.5 top-1/2 -mt-[5px] pointer-events-none text-muted motion-safe:transition-transform ${open ? 'rotate-180' : ''}`}>
      <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A checkmark for the selected option; a checkbox for every option of a multi-select. */
function Check({ checked, box }: { checked: boolean; box: boolean }) {
  if (box) {
    return (
      <span aria-hidden className={`inline-flex shrink-0 items-center justify-center w-4 h-4 rounded border ${checked ? 'bg-primary border-primary text-on-primary' : 'border-border'}`}>
        {checked && <CheckMark />}
      </span>
    );
  }
  return <span aria-hidden className="inline-flex shrink-0 w-4 justify-center">{checked && <CheckMark />}</span>;
}

function CheckMark() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <path d="M1.5 5.5l2.5 2.5 4.5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
