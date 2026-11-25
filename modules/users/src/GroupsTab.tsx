import { useEffect, useMemo, useState } from 'react';
import {
  Badge, ButtonGroup, ChipList, ConfirmDialog, DataTable, DeleteIcon, useApi, useAsync, useDashboard, useLiveReload, ErrorState, SkeletonTable,
} from '@qodalis/cli-server-dashboard-kit';
import { deleteGroup, errorMessage, getGroups, getPermissionCatalog, getUsers, type CliPermission, type Group } from './api';
import { useI18n } from './i18n';
import GroupModal from './GroupModal';
import { EditIcon } from './icons';
import type { ServerState } from './UsersPage';
import { BUTTON, CHIP, NOTICE, PRIMARY_BUTTON } from './ui';

/** The groups: their permissions and members; create, edit, delete (built-in groups stay). */
export default function GroupsTab({ server }: { server: ServerState }) {
  const { t } = useI18n();
  const api = useApi();
  const { hasPermission } = useDashboard();
  const { data, loading, error, refetch, refresh } = useAsync(async () => {
    const [groups, users] = await Promise.all([getGroups(api), getUsers(api).catch(() => [])]);
    return { groups, users };
  }, [api]);
  useLiveReload(['group:*', 'user:*'], refresh);
  const [catalog, setCatalog] = useState<CliPermission[]>([]);
  const descriptions = useMemo(() => new Map(catalog.map(e => [e.name.toLowerCase(), e.description])), [catalog]);

  useEffect(() => {
    let active = true;
    getPermissionCatalog(api, true)
      .then(entries => { if (active) setCatalog(entries); })
      .catch(() => {});
    return () => { active = false; };
  }, [api]);

  const [editing, setEditing] = useState<Group | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Group | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const writable = !server.groupsReadOnly;
  const canCreate = writable && hasPermission('groups:create');
  const canUpdate = writable && hasPermission('groups:update');
  const canDelete = writable && hasPermission('groups:delete');
  const members = (group: Group) => (data?.users ?? []).filter(u => u.groups.some(g => g.toLowerCase() === group.name.toLowerCase())).length;

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteGroup(api, deleting.name);
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
      header: t('users.groupName'),
      sortValue: (g: Group) => g.name.toLowerCase(),
      render: (g: Group) => (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-sm text-accent">{g.name}</span>
          {g.builtIn && <Badge variant="neutral">{t('users.builtIn')}</Badge>}
        </span>
      ),
    },
    {
      key: 'description',
      header: t('users.description'),
      render: (g: Group) => <span className="text-xs text-muted">{g.description || '–'}</span>,
    },
    {
      key: 'permissions',
      header: t('users.permissions'),
      render: (g: Group) => (
        <ChipList
          items={g.permissions.map(p => ({ key: p, label: p === '*' ? t('users.everything') : p, title: descriptions.get(p.toLowerCase()) }))}
          max={3}
          chipClassName={CHIP}
          className="max-w-[22rem]"
          label={t('users.permissions')}
          title={t('users.groupPermissionsOf', { name: g.name })}
          empty={t('users.noPermissions')}
        />
      ),
    },
    {
      key: 'members',
      header: t('users.members'),
      className: 'text-right',
      sortValue: (g: Group) => members(g),
      render: (g: Group) => <span className="text-xs tabular-nums">{members(g)}</span>,
    },
    ...(canUpdate || canDelete ? [{
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (g: Group) => (
        <ButtonGroup
          label={t('users.rowActions', { name: g.name })}
          labels="xl"
          items={[
            ...(canUpdate ? [{ key: 'edit', label: t('users.edit'), ariaLabel: t('users.editNamed', { name: g.name }), icon: <EditIcon />, onClick: () => setEditing(g) }] : []),
            ...(canDelete && !g.builtIn ? [{
              key: 'delete', label: t('users.delete'), ariaLabel: t('users.deleteNamed', { name: g.name }), icon: <DeleteIcon />, tone: 'danger' as const,
              onClick: () => { setDeleteError(null); setDeleting(g); },
            }] : []),
          ]}
        />
      ),
    }] : []),
  ];

  const groups = data?.groups ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-subtle">{data ? t('users.groupCount', { count: groups.length }) : ''}</span>
        <span className="flex-1" />
        <button onClick={refetch} className={BUTTON}>{t('users.refresh')}</button>
        {canCreate && <button onClick={() => setEditing('new')} className={PRIMARY_BUTTON}>{t('users.newGroup')}</button>}
      </div>
      <p className="text-xs text-subtle max-w-3xl">{t('users.groupsHint')}</p>
      {server.groupsReadOnly && <p role="note" className={NOTICE}>{t('users.groupsManagedByHost')}</p>}
      {loading && !data && <SkeletonTable rows={5} columns={columns.length} label={t('users.loading')} />}
      {error && <ErrorState title={t('users.error', { message: errorMessage(new Error(error)) })} onRetry={refetch} />}
      {data && groups.length > 0 && (
        <DataTable columns={columns} data={groups} keyExtractor={g => g.id} defaultSort={{ key: 'name', direction: 'asc' }} />
      )}

      {editing && (
        <GroupModal
          // The catalog may arrive after the dialog opened: its checkboxes start from it
          key={`${editing === 'new' ? 'new' : editing.id}:${catalog.length}`}
          target={editing}
          catalog={catalog}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        tone="danger"
        title={t('users.deleteGroupTitle')}
        message={deleting && t('users.deleteGroupConfirm', { name: deleting.name, count: members(deleting) })}
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
