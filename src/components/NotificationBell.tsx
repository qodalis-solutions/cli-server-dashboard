import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router';
import { overlayRoot, SkeletonList } from '@qodalis/cli-server-dashboard-kit';
import { useNotifications } from '../context/NotificationsContext';
import { badgeText, isExternalLink } from '../api/notifications';
import { useI18n } from '../i18n';
import type { NotificationItem, NotificationSeverity } from '../types';
import { useDismiss, usePopoverPosition } from './overlay';
import { focusableIn } from './drawerGestures';

/** The Notifications page. */
export const NOTIFICATIONS_PATH = '/notifications';

const SEVERITY_TONE: Record<NotificationSeverity, string> = {
  info: 'text-info bg-info/10',
  warning: 'text-warning bg-warning/10',
  error: 'text-error bg-error/10',
};

/** A notification's severity as a small round icon (i, !, ×). */
export function SeverityIcon({ severity, className = '' }: { severity: NotificationSeverity; className?: string }) {
  const glyph = severity === 'error' ? '×' : severity === 'warning' ? '!' : 'i';
  return (
    <span aria-hidden className={`inline-flex w-6 h-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${SEVERITY_TONE[severity]} ${className}`}>
      {glyph}
    </span>
  );
}

export function BellIcon({ size = 18 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

/**
 * The header's bell: the unread count as a badge, and a dropdown with the latest notifications (opening one marks it
 * read and follows its link), Mark all read and View all notifications. Hidden on servers without notifications.
 */
export default function NotificationBell({ compact = false }: { compact?: boolean }) {
  const { t, formatRelative } = useI18n();
  const { available, latest, unreadCount, loading, error, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const position = usePopoverPosition(open, trigger, panel, 'end');
  const close = (focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) trigger?.focus();
  };
  useDismiss(open, () => [trigger, panel.current], () => close(false), () => close(false));

  useEffect(() => {
    if (open) panel.current?.focus({ preventScroll: true });
  }, [open]);

  if (!available) return null;

  const label = unreadCount > 0 ? t('notifications.bell', { count: unreadCount }) : t('notifications.bellNone');

  function openItem(n: NotificationItem) {
    close(false);
    if (!n.read) void markRead(n.id).catch(() => {});
    if (!n.link) navigate(NOTIFICATIONS_PATH);
    else if (isExternalLink(n.link)) window.open(n.link, '_blank', 'noopener,noreferrer');
    else navigate(n.link);
  }

  function onPanelKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = focusableIn(panel.current);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <>
      <button
        ref={setTrigger}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        data-testid="notification-bell"
        className={`relative shrink-0 inline-flex items-center justify-center rounded-lg text-muted hover:text-text hover:bg-control transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          compact ? 'w-11 h-11' : 'w-8 h-8'
        }`}
      >
        <BellIcon size={compact ? 20 : 18} />
        {unreadCount > 0 && (
          <span
            aria-hidden
            data-testid="notification-badge"
            className="absolute -top-0.5 -right-0.5 min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-error text-on-primary text-[10px] font-semibold leading-[1.125rem] text-center ring-2 ring-sidebar"
          >
            {badgeText(unreadCount)}
          </span>
        )}
      </button>
      {open && createPortal(
        <div
          ref={panel}
          id={panelId}
          role="dialog"
          aria-label={t('notifications.title')}
          tabIndex={-1}
          onKeyDown={onPanelKey}
          style={position
            ? { left: position.left, top: position.top, maxHeight: position.maxHeight }
            : { left: 0, top: 0, visibility: 'hidden' }}
          className="fixed z-[60] w-[min(24rem,calc(100vw-1rem))] flex flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-xl focus:outline-none motion-safe:animate-pop-in"
        >
          <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-border/75">
            <h2 className="flex-1 text-sm font-semibold text-heading">{t('notifications.title')}</h2>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead().catch(() => {})}
                className="px-2 py-1 rounded-md text-xs text-accent hover:bg-control focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            {loading && !latest && <div className="p-3"><SkeletonList items={3} /></div>}
            {!!error && !latest && <p role="alert" className="p-4 text-xs text-error">{t('notifications.loadFailed')}</p>}
            {latest && latest.length === 0 && (
              <div className="px-4 py-8 text-center">
                <div aria-hidden className="text-2xl text-subtle mb-1">✓</div>
                <p className="text-sm text-text">{t('notifications.empty')}</p>
                <p className="text-xs text-subtle mt-0.5">{t('notifications.emptyHint')}</p>
              </div>
            )}
            {latest && latest.length > 0 && (
              <ul className="divide-y divide-border/60">
                {latest.map(n => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      data-testid="bell-item"
                      className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-control-hover focus:outline-none focus:bg-control-hover ${n.read ? '' : 'bg-primary/[0.04]'}`}
                    >
                      <SeverityIcon severity={n.severity} className="mt-0.5" />
                      <span className="flex-1 min-w-0">
                        <span className={`block text-sm leading-snug break-words ${n.read ? 'text-text' : 'text-heading font-medium'}`}>{n.title}</span>
                        {n.message && <span className="block text-xs text-muted mt-0.5 line-clamp-2 break-words">{n.message}</span>}
                        <span className="block text-[11px] text-subtle mt-1">{formatRelative(n.updatedAt)}</span>
                      </span>
                      {!n.read && <span aria-label={t('notifications.unread')} className="mt-1.5 w-2 h-2 shrink-0 rounded-full bg-primary" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="shrink-0 border-t border-border/75">
            <Link
              to={NOTIFICATIONS_PATH}
              onClick={() => close(false)}
              className="block px-3 py-2.5 text-center text-xs text-accent hover:bg-control focus:outline-none focus-visible:bg-control"
            >
              {t('notifications.viewAll')}
            </Link>
          </div>
        </div>,
        overlayRoot(),
      )}
    </>
  );
}
