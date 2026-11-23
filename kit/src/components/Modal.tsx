import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useComponentText } from './componentText';
import { focusableIn, trapFocusTarget } from './drawerGestures';
import { useBodyScrollLock } from './overlay';

export type ModalSize = 'sm' | 'md' | 'lg' | 'full';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Heading of the dialog and its accessible name. */
  title: ReactNode;
  children: ReactNode;
  /** Buttons in the footer. */
  actions?: ReactNode;
  /** `sm` confirmations, `md` forms (default), `lg` long content (an error with its stack trace, logs), `full` tools. */
  size?: ModalSize;
  /** Escape closes it (default). */
  closeOnEscape?: boolean;
  /** A click on the backdrop closes it (default). */
  closeOnBackdrop?: boolean;
  /** The close button in the header (default). */
  showClose?: boolean;
  /** Gets focus when the dialog opens; otherwise an `autoFocus` field, the first control of the body or the dialog. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Extra text under the title, used as the dialog's description. */
  description?: ReactNode;
}

const WIDTH: Record<ModalSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-3xl',
  full: 'sm:max-w-6xl sm:h-[90vh]',
};

/** Open dialogs, innermost last: only it answers Escape and Tab. */
const stack: symbol[] = [];

/**
 * A dialog over the page: rendered at the end of the page with a backdrop, focus kept inside it (Tab cycles) and given
 * back to the element that had it when it closes, the page behind it not scrolling. Escape and a click on the backdrop
 * close it unless turned off. Centered from `sm` up; a bottom sheet on phones (`full`: the whole screen), padded for
 * the safe areas. The entrance animation is skipped for reduced motion.
 */
export default function Modal({
  open, onClose, title, children, actions, size = 'md', closeOnEscape = true, closeOnBackdrop = true, showClose = true,
  initialFocus, description,
}: ModalProps) {
  const text = useComponentText();
  const titleId = useId();
  const descriptionId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const pressedBackdrop = useRef(false);
  const latest = useRef({ onClose, closeOnEscape });
  useEffect(() => {
    latest.current = { onClose, closeOnEscape };
  });
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const me = Symbol('modal');
    stack.push(me);
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // An autoFocus field already has focus; otherwise the requested element, the first control or the dialog itself
    if (!panel.current?.contains(document.activeElement)) {
      const target = initialFocus?.current ?? focusableIn(body.current)[0] ?? panel.current;
      target?.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== me) return;
      if (e.key === 'Escape') {
        // A select or menu inside the dialog closed itself
        if (e.defaultPrevented || !latest.current.closeOnEscape) return;
        e.preventDefault();
        latest.current.onClose();
      } else if (e.key === 'Tab') {
        const target = trapFocusTarget(focusableIn(panel.current), document.activeElement, e.shiftKey);
        if (target) {
          e.preventDefault();
          target.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(me), 1);
      if (previous?.isConnected) previous.focus();
    };
    // initialFocus is read once, when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const full = size === 'full';
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-overlay motion-safe:animate-fade-in"
      onMouseDown={e => { pressedBackdrop.current = e.target === e.currentTarget; }}
      onClick={e => {
        if (closeOnBackdrop && pressedBackdrop.current && e.target === e.currentTarget) onClose();
        pressedBackdrop.current = false;
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`relative flex flex-col w-full bg-popover border-border shadow-2xl focus:outline-none sm:border sm:rounded-xl sm:max-h-[90vh] ${WIDTH[size]} ${
          full
            ? 'h-[100dvh] sm:h-[90vh] pt-[env(safe-area-inset-top)] sm:pt-0'
            : 'max-h-[92dvh] border-t rounded-t-2xl motion-safe:animate-sheet-in sm:motion-safe:animate-pop-in'
        } pb-[env(safe-area-inset-bottom)] sm:pb-0 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] sm:px-0`}
      >
        {!full && <div aria-hidden className="sm:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-border" />}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-border/75">
          <div className="flex-1 min-w-0">
            <h3 id={titleId} className="text-base font-semibold text-heading break-words">{title}</h3>
            {description && <p id={descriptionId} className="mt-1 text-xs text-muted">{description}</p>}
          </div>
          {showClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={text('dialogClose')}
              title={text('dialogClose')}
              className="-mr-2 -my-1 w-11 h-11 sm:w-8 sm:h-8 shrink-0 inline-flex items-center justify-center rounded-lg text-muted hover:text-text hover:bg-control-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M2 2l8 8M10 2l-8 8" />
              </svg>
            </button>
          )}
        </div>
        <div ref={body} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 text-sm text-text">{children}</div>
        {actions && (
          <div className="px-5 py-3 border-t border-border/75 flex flex-wrap justify-end gap-2 [&>button]:min-h-11 sm:[&>button]:min-h-0">{actions}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
