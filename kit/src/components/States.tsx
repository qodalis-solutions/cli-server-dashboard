import type { ReactNode } from 'react';
import { useKitText } from '../i18n/text';
import { accessDenied, errorText } from './errorText';

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
 * The signed-in user may not open this (the server answered 403): a calm notice, not a failure, naming the missing
 * permission when it is known. ErrorState shows it for refusals by itself.
 */
export function NoAccessState({ permission, title, className = '' }: {
  /** The permission the page needs (`config:read`), when known. */
  permission?: string | null;
  /** Default: "You don't have access to this page". */
  title?: ReactNode;
  className?: string;
}) {
  const { t } = useKitText();
  return (
    <div role="status" className={`rounded-lg border border-border bg-control/40 p-4 flex items-start gap-3 ${className}`}>
      <span aria-hidden className="text-lg leading-none text-subtle">🔒</span>
      <div className="min-w-0">
        <div className="text-sm font-medium text-heading">{title ?? t('noAccess')}</div>
        <div className="mt-0.5 text-xs text-muted">
          {permission ? renderPermission(t('noAccessPermission', { permission: '\u0000' }), permission) : t('noAccessHint')}
        </div>
      </div>
    </div>
  );
}

/** The text with the permission in code style where `\u0000` stands. */
function renderPermission(text: string, permission: string): ReactNode {
  const [before, after = ''] = text.split('\u0000');
  return <>{before}<code className="font-mono text-text">{permission}</code>{after}</>;
}

/**
 * Something failed to load: what failed (`title`), the reason (`error`) and a Retry button when
 * `onRetry` is given. Announced as an alert. A refusal for lack of permission (403, `forbidden: missing permission
 * …`, `permission denied: …`) is not a failure: a full-size state shows NoAccessState instead, a compact one keeps its
 * title with the missing permission as the reason.
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
  const denied = accessDenied(error);
  if (denied && !compact) return <NoAccessState permission={denied.permission} className={className} />;
  const reason = error === undefined || error === null || error === ''
    ? ''
    : denied?.permission ? t('missingPermission', { permission: denied.permission }) : errorText(error);
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
