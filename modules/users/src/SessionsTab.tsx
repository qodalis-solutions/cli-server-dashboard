import { useState } from 'react';
import {
  Badge, ButtonGroup, ConfirmDialog, DataTable, RevokeIcon, useApi, useAsync, useDashboard, useLiveReload, ErrorState, SkeletonTable,
} from '@qodalis/cli-server-dashboard-kit';
import { errorMessage, getSessions, revokeSession, type Session } from './api';
import { useI18n } from './i18n';
import { BUTTON, NOTICE } from './ui';

/** A short name of the client from its user agent: the browser and the system, else the agent's first word. */
export function clientName(userAgent: string | undefined): string {
  if (!userAgent) return '';
  const browser = /Edg\//.test(userAgent) ? 'Edge'
    : /Firefox\//.test(userAgent) ? 'Firefox'
    : /Chrome\//.test(userAgent) ? 'Chrome'
    : /Safari\//.test(userAgent) ? 'Safari'
    : undefined;
  const system = /Android/.test(userAgent) ? 'Android'
    : /iPhone|iPad/.test(userAgent) ? 'iOS'
    : /Mac OS X/.test(userAgent) ? 'macOS'
    : /Windows/.test(userAgent) ? 'Windows'
    : /Linux/.test(userAgent) ? 'Linux'
    : undefined;
  if (browser) return system ? `${browser} · ${system}` : browser;
  return userAgent.split(/[\s/]/)[0];
}

/** Signed-in sessions (`sessions:read`): who, since when, last activity, from where; revoke (`sessions:revoke`). */
export default function SessionsTab() {
  const { t, formatDate, formatRelative } = useI18n();
  const api = useApi();
  const { hasPermission, user: me } = useDashboard();
  const { data, loading, error, refetch, refresh } = useAsync(() => getSessions(api), [api]);
  useLiveReload(['session:*'], refresh);
  const [revoking, setRevoking] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const canRevoke = (s: Session) => !s.current && (hasPermission('sessions:revoke') || s.userId === me.id);

  async function confirmRevoke() {
    if (!revoking) return;
    setBusy(true);
    try {
      await revokeSession(api, revoking.id);
      setRevoking(null);
      refresh();
    } catch (err) {
      setRevokeError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const columns = [
    {
      key: 'user',
      header: t('users.user'),
      sortValue: (s: Session) => s.userName.toLowerCase(),
      render: (s: Session) => (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm text-heading">{s.userName}</span>
          {s.current && <Badge variant="info">{t('users.thisSession')}</Badge>}
        </span>
      ),
    },
    {
      key: 'client',
      header: t('users.client'),
      render: (s: Session) => (
        <span className="text-xs text-muted" title={s.metadata?.userAgent}>
          {clientName(s.metadata?.userAgent) || '–'}
          {s.metadata?.remoteAddress && <span className="block font-mono text-[11px] text-subtle">{s.metadata.remoteAddress}</span>}
        </span>
      ),
    },
    {
      key: 'signedIn',
      header: t('users.signedIn'),
      sortValue: (s: Session) => s.createdAt,
      render: (s: Session) => <span className="text-xs text-muted whitespace-nowrap" title={formatDate(s.createdAt)}>{formatRelative(s.createdAt)}</span>,
    },
    {
      key: 'lastActivity',
      header: t('users.lastActivity'),
      sortValue: (s: Session) => s.lastActivity,
      render: (s: Session) => <span className="text-xs text-muted whitespace-nowrap" title={formatDate(s.lastActivity)}>{formatRelative(s.lastActivity)}</span>,
    },
    {
      key: 'expires',
      header: t('users.expires'),
      sortValue: (s: Session) => s.expiresAt,
      render: (s: Session) => <span className="text-xs text-muted whitespace-nowrap" title={formatDate(s.expiresAt)}>{formatRelative(s.expiresAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (s: Session) => canRevoke(s) ? (
        <ButtonGroup
          label={t('users.rowActions', { name: s.userName })}
          labels="sm"
          items={[{
            key: 'revoke', label: t('users.signOutSession'), ariaLabel: t('users.signOutNamed', { name: s.userName }), icon: <RevokeIcon />, tone: 'danger',
            onClick: () => { setRevokeError(null); setRevoking(s); },
          }]}
        />
      ) : null,
    },
  ];

  const sessions = data ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-subtle">{data ? t('users.sessionCount', { count: sessions.length }) : ''}</span>
        <span className="flex-1" />
        <button onClick={refetch} className={BUTTON}>{t('users.refresh')}</button>
      </div>
      {loading && !data && <SkeletonTable rows={5} columns={columns.length} label={t('users.loading')} />}
      {error && <ErrorState title={t('users.error', { message: errorMessage(new Error(error)) })} onRetry={refetch} />}
      {data && sessions.length === 0 && !error && <div role="status" className={NOTICE}>{t('users.noSessions')}</div>}
      {data && sessions.length > 0 && (
        <DataTable columns={columns} data={sessions} keyExtractor={s => s.id} defaultSort={{ key: 'lastActivity', direction: 'desc' }} />
      )}
      <ConfirmDialog
        open={revoking !== null}
        tone="danger"
        title={t('users.signOutTitle')}
        message={revoking && t('users.signOutConfirm', { name: revoking.userName })}
        confirmLabel={t('users.signOutSession')}
        busyLabel={t('users.signingOut')}
        busy={busy}
        error={revokeError}
        onConfirm={confirmRevoke}
        onCancel={() => setRevoking(null)}
      />
    </div>
  );
}
