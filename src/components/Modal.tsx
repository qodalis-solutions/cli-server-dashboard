import { useEffect, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  /** Room for long content (an error with its stack trace, logs). */
  wide?: boolean;
}

export default function Modal({ open, onClose, title, children, actions, wide = false }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`bg-popover border border-border rounded-xl w-full ${wide ? 'max-w-3xl max-h-[90vh] flex flex-col' : 'max-w-md'} mx-4 shadow-2xl`}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border/75">
          <h3 className="text-base font-semibold text-heading">{title}</h3>
        </div>
        <div className={`px-5 py-4 text-sm text-text ${wide ? 'overflow-y-auto min-h-0' : ''}`}>{children}</div>
        {actions && (
          <div className="px-5 py-3 border-t border-border/75 flex justify-end gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
}
