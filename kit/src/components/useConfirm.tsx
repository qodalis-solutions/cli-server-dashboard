import { useCallback, useState, type ReactNode } from 'react';
import ConfirmDialog from './ConfirmDialog';

export interface ConfirmOptions {
  title: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  /** The action, run while the dialog shows its loading state; the dialog closes when it settles without throwing. */
  onConfirm?: () => void | Promise<void>;
}

/**
 * `window.confirm` as a dialog: `if (!(await confirm({ title, message }))) return;`, or pass `onConfirm` to run the
 * action inside the dialog. Render `dialog` once in the component.
 */
export function useConfirm(): { confirm: (options: ConfirmOptions) => Promise<boolean>; dialog: ReactNode } {
  const [request, setRequest] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>(resolve => setRequest({ ...options, resolve })),
    [],
  );

  const dialog = (
    <ConfirmDialog
      open={request !== null}
      title={request?.title ?? ''}
      message={request?.message}
      confirmLabel={request?.confirmLabel}
      cancelLabel={request?.cancelLabel}
      tone={request?.tone}
      onCancel={() => {
        request?.resolve(false);
        setRequest(null);
      }}
      onConfirm={async () => {
        if (!request) return;
        await request.onConfirm?.();
        request.resolve(true);
        setRequest(null);
      }}
    />
  );
  return { confirm, dialog };
}
