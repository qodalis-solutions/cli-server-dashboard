import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ButtonGroup, EmptyState, ErrorState, SkeletonList } from '@qodalis/cli-server-dashboard-kit';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import { useConfirm } from '../../components/useConfirm';
import { SeverityIcon } from '../../components/NotificationBell';
import { useApi } from '../../hooks/useApi';
import { useI18n } from '../../i18n';
import { useNotifications } from '../../context/NotificationsContext';
import { useExtensions } from '../../context/ExtensionsContext';
import { getNotifications, isExternalLink, NOTIFICATION_SEVERITIES, NOTIFICATIONS_MANAGE_PERMISSION } from '../../api/notifications';
import { serverMessage } from '../../api/auth';
import type { NotificationItem, NotificationSeverity } from '../../types';

const SEVERITY_BADGE: Record<NotificationSeverity, 'info' | 'warning' | 'error'> = { info: 'info', warning: 'warning', error: 'error' };

const ACTION = 'px-2.5 py-1.5 min-h-9 sm:min-h-0 text-xs rounded-lg transition-colors inline-flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60';
const ACTION_PRIMARY = `${ACTION} bg-primary text-on-primary hover:bg-primary-hover`;
const ACTION_SECONDARY = `${ACTION} bg-control hover:bg-control-hover text-text`;
const ACTION_DANGER = `${ACTION} bg-control text-error hover:bg-error/10`;

/** The filters, kept in the URL: `?unread=1&severity=warning`. */
function useFilters() {
  const [params, setParams] = useSearchParams();
  const unread = params.get('unread') === '1';
  const raw = params.get('severity');
  const severity = NOTIFICATION_SEVERITIES.includes(raw as NotificationSeverity) ? (raw as NotificationSeverity) : null;
  const set = (name: string, value: string | null) => setParams(prev => {
    const query = new URLSearchParams(prev);
    if (value === null) query.delete(name);
    else query.set(name, value);
    return query;
  }, { replace: true });
  return { unread, severity, setUnread: (on: boolean) => set('unread', on ? '1' : null), setSeverity: (s: NotificationSeverity | null) => set('severity', s) };
}

function NotificationCard({ item, canManage, busy, onAction }: {
  item: NotificationItem;
  canManage: boolean;
  busy: boolean;
  onAction: (action: 'read' | 'dismiss' | 'clear') => void;
}) {
  const { t, formatRelative, formatDate } = useI18n();
  const link = item.link;
  return (
    <article
      aria-label={item.title}
      data-testid="notification-card"
      className={`bg-surface border rounded-xl p-4 flex gap-3 ${item.read ? 'border-border' : 'border-primary/40'}`}
    >
      <SeverityIcon severity={item.severity} className="mt-0.5" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className={`text-sm break-words min-w-0 ${item.read ? 'text-text' : 'text-heading font-semibold'}`}>{item.title}</h3>
          {!item.read && <Badge variant="info" dot>{t('notifications.unread')}</Badge>}
        </div>
        {item.message && <p className="text-xs text-muted whitespace-pre-wrap break-words">{item.message}</p>}
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-subtle">
          <Badge variant={SEVERITY_BADGE[item.severity]}>{t(`notifications.${item.severity}`)}</Badge>
          <span className="font-mono">{item.kind}</span>
          <time dateTime={item.updatedAt} title={formatDate(item.updatedAt)}>{formatRelative(item.updatedAt)}</time>
        </div>
        <div role="group" aria-label={t('notifications.itemActions', { title: item.title })} className="flex flex-wrap items-center gap-2 pt-1">
          {link && (isExternalLink(link)
            ? <a href={link} target="_blank" rel="noopener noreferrer" className={ACTION_PRIMARY} onClick={() => !item.read && onAction('read')}>{t('notifications.open')} ↗</a>
            : <Link to={link} className={ACTION_PRIMARY} onClick={() => !item.read && onAction('read')}>{t('notifications.open')}</Link>)}
          {!item.read && (
            <button type="button" disabled={busy} onClick={() => onAction('read')} className={ACTION_SECONDARY}>{t('notifications.markRead')}</button>
          )}
          <button type="button" disabled={busy} onClick={() => onAction('dismiss')} className={ACTION_SECONDARY}>{t('notifications.dismiss')}</button>
          {canManage && (
            <button type="button" disabled={busy} onClick={() => onAction('clear')} className={ACTION_DANGER}>{t('notifications.clearEveryone')}</button>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * Notifications: every notification the user may see, newest first, filtered by unread and severity (kept in the
 * URL), with Open (its link), Mark read, Dismiss and, for `notifications:manage`, Clear for everyone. Live: the list
 * is loaded again whenever the server announces a change.
 */
export default function NotificationsPage() {
  const { t } = useI18n();
  const { unread, severity, setUnread, setSeverity } = useFilters();
  const { revision, unreadCount, markRead, markAllRead, dismiss } = useNotifications();
  const canManage = useExtensions().hasPermission(NOTIFICATIONS_MANAGE_PERMISSION);
  const { confirm, dialog } = useConfirm();
  const fetcher = useCallback(() => getNotifications({ unread, severity }), [unread, severity]);
  const list = useApi(fetcher, [fetcher, revision]);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function act(item: NotificationItem, action: 'read' | 'dismiss' | 'clear') {
    if (action === 'clear') {
      const ok = await confirm({
        title: t('notifications.confirmClear'),
        message: t('notifications.confirmClearMessage', { title: item.title }),
        confirmLabel: t('notifications.clearEveryone'),
        tone: 'danger',
      });
      if (!ok) return;
    }
    setBusy(item.id);
    setFailure(null);
    try {
      if (action === 'read') await markRead(item.id);
      else await dismiss(item.id, action === 'clear');
    } catch (err) {
      setFailure(t('notifications.actionFailed', { message: serverMessage(err) }));
    } finally {
      setBusy(null);
    }
  }

  async function readAll() {
    setFailure(null);
    try {
      await markAllRead();
    } catch (err) {
      setFailure(t('notifications.actionFailed', { message: serverMessage(err) }));
    }
  }

  // A server without notifications (404) answers null: shown as an empty list
  const items = list.data?.items ?? (!list.loading && !list.error ? [] : null);
  const filtered = unread || severity !== null;

  return (
    <div>
      {dialog}
      <PageHeader
        title={t('notifications.title')}
        subtitle={unreadCount > 0 ? t('notifications.subtitle', { count: unreadCount }) : t('notifications.subtitleNone')}
        actions={
          <div className="flex flex-wrap gap-2">
            {unreadCount > 0 && (
              <button type="button" onClick={() => void readAll()} className={ACTION_SECONDARY}>{t('notifications.markAllRead')}</button>
            )}
            <button type="button" onClick={list.refetch} className={ACTION_SECONDARY}>{t('common.refresh')}</button>
          </div>
        }
      />
      <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
        <div className="flex flex-wrap items-center gap-3">
          <ButtonGroup
            label={t('notifications.filterStatus')}
            items={[
              { key: 'all', label: t('notifications.filterAll'), pressed: !unread, tone: !unread ? 'primary' : 'default', onClick: () => setUnread(false) },
              { key: 'unread', label: t('notifications.filterUnread'), pressed: unread, tone: unread ? 'primary' : 'default', onClick: () => setUnread(true) },
            ]}
          />
          <ButtonGroup
            label={t('notifications.severity')}
            items={[
              { key: 'any', label: t('notifications.severityAll'), pressed: severity === null, tone: severity === null ? 'primary' : 'default', onClick: () => setSeverity(null) },
              ...NOTIFICATION_SEVERITIES.map(s => ({
                key: s,
                label: t(`notifications.${s}`),
                pressed: severity === s,
                tone: (severity === s ? 'primary' : 'default') as 'primary' | 'default',
                onClick: () => setSeverity(s),
              })),
            ]}
          />
        </div>
        {failure && <ErrorState error={failure} title={t('notifications.title')} compact />}
        {list.loading && !list.data && <SkeletonList items={4} label={t('notifications.title')} className="bg-surface border border-border rounded-xl p-4" />}
        {list.error && !list.data && <ErrorState title={t('notifications.loadFailed')} error={list.error} onRetry={list.refetch} />}
        {items && items.length === 0 && (
          <EmptyState
            className="bg-surface border border-border rounded-xl"
            message={filtered ? t('notifications.noMatch') : t('notifications.empty')}
            detail={filtered ? undefined : t('notifications.emptyHint')}
          />
        )}
        {items && items.length > 0 && (
          <div className="space-y-3">
            {items.map(item => (
              <NotificationCard key={item.id} item={item} canManage={canManage} busy={busy === item.id} onAction={action => void act(item, action)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
