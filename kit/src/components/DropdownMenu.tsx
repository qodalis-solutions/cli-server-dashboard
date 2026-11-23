import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { firstEnabled, isTypeaheadKey, lastEnabled, nextEnabled, useDismiss, usePopoverPosition, useTypeahead } from './overlay';

export interface DropdownMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  /** `danger` for destructive actions. */
  tone?: 'default' | 'danger';
  disabled?: boolean;
}

/** A line between groups of items. */
export const MENU_SEPARATOR = 'separator' as const;

interface Props {
  items: readonly (DropdownMenuItem | typeof MENU_SEPARATOR)[];
  /** The button's content (a label, an avatar, an icon). */
  children: ReactNode;
  /** Accessible name of the button (and the menu) when its content is not text. */
  label?: string;
  /** Which edge of the button the menu lines up with. */
  align?: 'start' | 'end';
  /** Classes of the button. */
  buttonClassName?: string;
  /** Shown above the items (e.g. who is signed in). */
  header?: ReactNode;
}

/**
 * A button that opens a menu of actions (`role="menu"`): rendered at the end of the page, below the button or above it
 * when there is no room. Arrows, Home/End and type-ahead move between items, Enter or Space runs one, Escape and Tab
 * close it; so do a press outside it and scrolling the page. Focus returns to the button.
 */
export default function DropdownMenu({ items, children, label, align = 'start', buttonClassName = '', header }: Props) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const typeahead = useTypeahead();
  const actions = items.filter((i): i is DropdownMenuItem => i !== MENU_SEPARATOR);
  const disabled = actions.map(i => !!i.disabled);
  const position = usePopoverPosition(open, trigger, panel, align);

  const close = (focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) trigger?.focus();
  };
  useDismiss(open, () => [trigger, panel.current], () => close(false), () => close(false));

  function openAt(index: number) {
    setActive(index);
    setOpen(true);
  }

  // The active item has focus (roving focus inside the menu)
  useEffect(() => {
    if (!open) return;
    if (active >= 0) itemRefs.current[active]?.focus();
    else panel.current?.focus();
  }, [open, active]);

  function run(item: DropdownMenuItem) {
    if (item.disabled) return;
    close();
    item.onSelect();
  }

  function onTriggerKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openAt(firstEnabled(disabled));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      openAt(lastEnabled(disabled));
    }
  }

  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive(a => { const n = nextEnabled(disabled, a, 1); return n === a ? firstEnabled(disabled) : n; });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive(a => { const n = nextEnabled(disabled, a, -1); return n === a ? lastEnabled(disabled) : n; });
        break;
      case 'Home':
        e.preventDefault();
        setActive(firstEnabled(disabled));
        break;
      case 'End':
        e.preventDefault();
        setActive(lastEnabled(disabled));
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case 'Tab':
        e.preventDefault();
        close();
        break;
      default:
        if (isTypeaheadKey(e)) setActive(a => typeahead(e.key, actions.map(i => i.label), disabled, a));
    }
  }

  let index = -1;
  return (
    <>
      <button
        ref={setTrigger}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : openAt(-1))}
        onKeyDown={onTriggerKey}
        className={buttonClassName}
      >
        {children}
      </button>
      {open && createPortal(
        <div
          ref={panel}
          id={menuId}
          role="menu"
          aria-label={label}
          data-placement={position?.placement}
          onKeyDown={onMenuKey}
          // A menu opened by a click has no active item yet: focus the menu itself so the keys work
          tabIndex={-1}
          style={position
            ? { left: position.left, top: position.top, maxHeight: position.maxHeight }
            : { left: 0, top: 0, visibility: 'hidden' }}
          className="fixed z-[60] min-w-[11rem] max-w-[min(20rem,calc(100vw-1rem))] overflow-y-auto p-1 rounded-lg border border-border bg-popover shadow-xl focus:outline-none motion-safe:animate-pop-in"
        >
          {header && <div className="px-2.5 py-2 mb-1 border-b border-border/75 text-xs text-muted">{header}</div>}
          {items.map((item, i) => {
            if (item === MENU_SEPARATOR) return <div key={`sep-${i}`} role="separator" className="my-1 h-px bg-border/75" />;
            const at = ++index;
            return (
              <button
                key={item.key}
                ref={el => { itemRefs.current[at] = el; }}
                type="button"
                role="menuitem"
                tabIndex={at === active ? 0 : -1}
                aria-disabled={item.disabled || undefined}
                onClick={() => run(item)}
                onMouseMove={() => { if (!item.disabled && active !== at) setActive(at); }}
                className={`w-full flex items-center gap-2 min-h-11 sm:min-h-8 px-2.5 py-1 rounded-md text-sm sm:text-xs text-left focus:outline-none focus:bg-control-hover ${
                  item.disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-control-hover'
                } ${item.tone === 'danger' ? 'text-error' : 'text-text'}`}
              >
                {item.icon && <span aria-hidden className="inline-flex w-4 justify-center shrink-0">{item.icon}</span>}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
