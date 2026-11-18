import { useRef, useState, type ReactNode } from 'react';
import Modal from './Modal';
import { useComponentText } from './componentText';

export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  /** The question, or what will happen. */
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger`: a red confirm button, for deleting, revoking, cancelling a run. */
  tone?: 'default' | 'danger';
  /**
   * Runs on confirm. While its promise is pending the button shows a spinner and the dialog cannot be dismissed; when it
   * rejects, its message is shown in the dialog, which stays open. The caller closes the dialog (sets `open`).
   */
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  /** Shown under the message (e.g. an error the caller reports itself). */
  error?: ReactNode;
  /** The caller's own pending state, for actions it tracks itself. */
  busy?: boolean;
}

const BUTTON = 'px-3 py-1.5 text-sm sm:text-xs rounded-lg transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-1.5';

/** A yes/no question in a dialog, replacing `window.confirm`; Cancel has focus first for dangerous actions. */
export default function ConfirmDialog({
  open, title, message, confirmLabel, cancelLabel, tone = 'default', onConfirm, onCancel, error, busy = false,
}: ConfirmDialogProps) {
  const text = useComponentText();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const working = pending || busy;

  async function confirm() {
    setFailure(null);
    setPending(true);
    try {
      await onConfirm();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  const cancel = () => {
    if (working) return;
    setFailure(null);
    onCancel();
  };

  return (
    <Modal
      open={open}
      onClose={cancel}
      title={title}
      size="sm"
      closeOnEscape={!working}
      closeOnBackdrop={!working}
      showClose={false}
      initialFocus={tone === 'danger' ? cancelRef : confirmRef}
      actions={<>
        <button ref={cancelRef} type="button" onClick={cancel} disabled={working} className={`${BUTTON} bg-control hover:bg-control-hover text-text`}>
          {cancelLabel ?? text('confirmCancel')}
        </button>
        <button
          ref={confirmRef}
          type="button"
          onClick={() => void confirm()}
          disabled={working}
          aria-busy={working || undefined}
          className={`${BUTTON} ${tone === 'danger' ? 'bg-error/20 hover:bg-error/30 text-error' : 'bg-primary hover:bg-primary-hover text-on-primary'}`}
        >
          {working && <Spinner />}
          {working ? text('confirmBusy') : confirmLabel ?? text('confirmOk')}
        </button>
      </>}
    >
      <div className="space-y-2">
        <div>{message}</div>
        {(failure || error) && <p role="alert" className="text-error text-xs">{failure ?? error}</p>}
      </div>
    </Modal>
  );
}

function Spinner() {
  return (
    <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" className="animate-spin motion-reduce:animate-none">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
