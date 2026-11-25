import type { ReactNode } from 'react';
import { useKitText } from '../i18n/text';
import { errorText } from './errorText';

/** Nothing to show (no rows, nothing matches a filter): a quiet centered message, with an optional action. */
export function EmptyState({ message, detail, action, className = '' }: {
  message?: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { t } = useKitText();
  return (
    <div className={`px-4 py-8 text-center ${className}`}>
      <div className="text-sm text-subtle">{message ?? t('noData')}</div>
      {detail && <div className="text-xs text-subtle/80 mt-1">{detail}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/**
 * Something failed to load: what failed (`title`), the reason (`error`) and a Retry button when
 * `onRetry` is given. Announced as an alert.
 */
export function ErrorState({ title, error, onRetry, compact = false, className = '' }: {
  title?: ReactNode;
  error?: unknown;
  onRetry?: () => void;
  /** One line, for a failure inside a card or a panel. */
  compact?: boolean;
  className?: string;
}) {
  const { t } = useKitText();
  const reason = error === undefined || error === null || error === '' ? '' : errorText(error);
  return (
    <div
      role="alert"
      className={`rounded-lg border border-error/30 bg-error/[0.06] ${compact ? 'px-3 py-2' : 'p-4'} flex flex-wrap items-start justify-between gap-3 ${className}`}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-error">{title ?? t('loadFailed')}</div>
        {reason && <div className="mt-0.5 text-xs text-error/80 font-mono break-all">{reason}</div>}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 px-3 py-1 text-xs rounded-md border border-error/40 text-error hover:bg-error/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/50"
        >
          {t('retry')}
        </button>
      )}
    </div>
  );
}
