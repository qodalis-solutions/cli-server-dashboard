import { useState } from 'react';
import {
  Badge, ButtonGroup, ChipList, ConfirmDialog, DataTable, DeleteIcon, useApi, useDashboard, useQueryParams, ErrorState, SkeletonTable, type AsyncResult,
} from '@qodalis/cli-server-dashboard-kit';
import { deleteUser, errorMessage, type User } from './api';
import { useI18n } from './i18n';
import { canChangePassword } from './permissions';
import UserModal from './UserModal';
import PasswordModal from './PasswordModal';
import { EditIcon, KeyIcon } from './icons';
import type { ServerState } from './UsersPage';
import type { UsersData } from './UsersStats';
import { BUTTON, CHIP, INPUT, NOTICE, PRIMARY_BUTTON } from './ui';

/** Whether a user matches the search: name, email or a group, ignoring case. */
export function matchesUser(user: User, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return user.name.toLowerCase().includes(q) || user.email.toLowerCase().includes(q) || user.groups.some(g => g.toLowerCase().includes(q));
}

/**
 * The users: search (`?q=`), create, edit (groups, disabled), set a password, delete. `source` is the page's users and
 * groups, shared with its statistics and reloaded live there.
 */
export default function UsersTab({ server, source }: { server: ServerState; source: AsyncResult<UsersData> }) {
  const { t, formatDate, formatRelative } = useI18n();
  const api = useApi();
  const { hasPermission, user: me } = useDashboard();
  const [params, setParams] = useQueryParams();
  const query = params.get('q') ?? '';
  const { data, loading, error, refetch, refresh } = source;

  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [passwordFor, setPasswordFor] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const writable = !server.usersReadOnly;
  const canCreate = writable && hasPermission('users:create');
  const canUpdate = writable && hasPermission('users:update');
  const canDelete = writable && hasPermission('users:delete');
  const passwords = canUpdate && canChangePassword(server.authMode, server.usersReadOnly);

  const users = (data?.users ?? []).filter(u => matchesUser(u, query));
  const setQuery = (value: string) => setParams(prev => {
    const next = new URLSearchParams(prev);
    if (value) next.set('q', value);
    else next.delete('q');
    return next;
  });

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteUser(api, deleting.id);
      setDeleting(null);
      refresh();
    } catch (err) {
      setDeleteError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const columns = [
    {
      key: 'name',
      header: t('users.name'),
      sortValue: (u: User) => u.name.toLowerCase(),
      render: (u: User) => (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm text-heading" title={t('users.createdOn', { date: formatDate(u.createdAt, { dateStyle: 'medium' }) })}>{u.name}</span>
          {u.id === me.id && <Badge variant="info">{t('users.you')}</Badge>}
          {u.disabled && <Badge variant="neutral">{t('users.disabled')}</Badge>}
          {u.mustChangePassword && <span title={t('users.mustChangeHint')}><Badge variant="warning">{t('users.mustChange')}</Badge></span>}
        </span>
      ),
    },
    {
      key: 'email',
      header: t('users.email'),
      sortValue: (u: User) => u.email.toLowerCase(),
      render: (u: User) => <span className="text-xs text-muted whitespace-nowrap">{u.email}</span>,
    },
    {
      key: 'groups',
      header: t('users.groups'),
      render: (u: User) => (
        <ChipList items={u.groups} max={3} chipClassName={CHIP} className="max-w-[16rem]" label={t('users.groups')} title={t('users.groupsOf', { name: u.name })} empty="–" />
      ),
    },
    {
      key: 'lastLogin',
      header: t('users.lastSignIn'),
      sortValue: (u: User) => u.lastLoginAt,
      render: (u: User) => u.lastLoginAt
        ? <span className="text-xs text-muted whitespace-nowrap" title={formatDate(u.lastLoginAt)}>{formatRelative(u.lastLoginAt)}</span>
        : <span className="text-xs text-subtle">{t('users.never')}</span>,
    },
    ...(canUpdate || canDelete ? [{
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (u: User) => (
        <ButtonGroup
          label={t('users.rowActions', { name: u.name })}
          labels="xl"
          items={[
            ...(canUpdate ? [{ key: 'edit', label: t('users.edit'), ariaLabel: t('users.editNamed', { name: u.name }), icon: <EditIcon />, onClick: () => setEditing(u) }] : []),
            ...(passwords ? [{ key: 'password', label: t('users.setPassword'), ariaLabel: t('users.setPasswordNamed', { name: u.name }), icon: <KeyIcon />, onClick: () => setPasswordFor(u) }] : []),
            ...(canDelete && u.id !== me.id ? [{
              key: 'delete', label: t('users.delete'), ariaLabel: t('users.deleteNamed', { name: u.name }), icon: <DeleteIcon />, tone: 'danger' as const,
              onClick: () => { setDeleteError(null); setDeleting(u); },
            }] : []),
          ]}
        />
      ),
    }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('users.search')}
          aria-label={t('users.search')}
          className={`${INPUT} max-w-xs`}
        />
        <span className="text-xs text-subtle">{data ? t('users.count', { count: users.length }) : ''}</span>
        <span className="flex-1" />
        <button onClick={refetch} className={BUTTON}>{t('users.refresh')}</button>
        {canCreate && <button onClick={() => setEditing('new')} className={PRIMARY_BUTTON}>{t('users.newUser')}</button>}
      </div>
      {server.usersReadOnly && <p role="note" className={NOTICE}>{t('users.managedByHost')}</p>}
      {loading && !data && <SkeletonTable rows={5} columns={columns.length} label={t('users.loading')} />}
      {error && <ErrorState title={t('users.error', { message: errorMessage(new Error(error)) })} onRetry={refetch} />}
      {data && users.length === 0 && !error && <div role="status" className={NOTICE}>{query ? t('users.noMatch') : t('users.none')}</div>}
      {data && users.length > 0 && (
        <DataTable columns={columns} data={users} keyExtractor={u => u.id} defaultSort={{ key: 'name', direction: 'asc' }} />
      )}

      {editing && (
        <UserModal
          key={editing === 'new' ? 'new' : editing.id}
          target={editing}
          groups={data?.groups ?? []}
          passwords={canChangePassword(server.authMode, server.usersReadOnly)}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
      {passwordFor && (
        <PasswordModal key={passwordFor.id} target={passwordFor} onClose={() => setPasswordFor(null)} onSaved={() => { setPasswordFor(null); refresh(); }} />
      )}
      <ConfirmDialog
        open={deleting !== null}
        tone="danger"
        title={t('users.deleteTitle')}
        message={deleting && t('users.deleteConfirm', { name: deleting.name })}
        confirmLabel={t('users.delete')}
        busyLabel={t('users.deleting')}
        busy={busy}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
