import { useEffect, useState } from 'react';
import { PageHeader, useApi, useAsync, useDashboard, useLiveReload, useQueryParams } from '@qodalis/cli-server-dashboard-kit';
import { getAuthMode, getCurrentSession, getGroups, getSessions, getUsers } from './api';
import { useI18n } from './i18n';
import UsersTab from './UsersTab';
import GroupsTab from './GroupsTab';
import SessionsTab from './SessionsTab';
import UsersStats, { type UsersData } from './UsersStats';

/** What the server lets this dashboard change: users and groups may be the host application's, passwords too. */
export interface ServerState {
  usersReadOnly: boolean;
  groupsReadOnly: boolean;
  /** Undefined until known (servers without the endpoint: password). */
  authMode?: 'password' | 'external';
}

type Tab = 'users' | 'groups' | 'sessions';

/** The users page (`/x/users`, `users:read`): users, groups and signed-in sessions, each tab in the query (`?tab=`). */
export default function UsersPage() {
  const { t } = useI18n();
  const api = useApi();
  const { hasPermission } = useDashboard();
  const [params, setParams] = useQueryParams();
  const [server, setServer] = useState<ServerState>({ usersReadOnly: false, groupsReadOnly: false });
  const canReadSessions = hasPermission('sessions:read');
  // Once for the statistics and the users tab; groups and sessions are optional (a card less when they fail)
  const source = useAsync(async (): Promise<UsersData> => {
    const [users, groups, sessions] = await Promise.all([
      getUsers(api),
      getGroups(api).catch(() => null),
      canReadSessions ? getSessions(api).catch(() => null) : Promise.resolve(null),
    ]);
    return { users, groups, sessions, at: Date.now() };
  }, [api, canReadSessions]);
  useLiveReload(['user:*', 'group:*', 'session:*'], source.refresh);

  useEffect(() => {
    let active = true;
    getCurrentSession(api)
      .then(s => { if (active) setServer(prev => ({ ...prev, usersReadOnly: !!s.usersReadOnly, groupsReadOnly: !!s.groupsReadOnly })); })
      .catch(() => {});
    getAuthMode(api)
      .then(m => { if (active) setServer(prev => ({ ...prev, authMode: m.mode === 'external' ? 'external' : 'password' })); })
      .catch(() => { if (active) setServer(prev => ({ ...prev, authMode: 'password' })); });
    return () => { active = false; };
  }, [api]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'users', label: t('users.tabUsers') },
    { key: 'groups', label: t('users.tabGroups') },
    ...(canReadSessions ? [{ key: 'sessions' as const, label: t('users.tabSessions') }] : []),
  ];
  const requested = params.get('tab');
  const tab: Tab = tabs.some(x => x.key === requested) ? (requested as Tab) : 'users';
  const select = (key: Tab) => setParams(() => (key === 'users' ? new URLSearchParams() : new URLSearchParams({ tab: key })));

  return (
    <div>
      <PageHeader title={t('users.title')} subtitle={t('users.subtitle')} />
      <div className="px-4 sm:px-6 pt-4 space-y-4">
        <UsersStats source={source} hideError={tab === 'users'} />
        <div role="tablist" aria-label={t('users.title')} className="flex gap-1 border-b border-border">
          {tabs.map(x => (
            <button
              key={x.key}
              role="tab"
              id={`users-tab-${x.key}`}
              aria-selected={tab === x.key}
              aria-controls={`users-panel-${x.key}`}
              onClick={() => select(x.key)}
              className={`px-3 py-2 text-sm -mb-px border-b-2 transition-colors ${
                tab === x.key ? 'border-primary text-heading' : 'border-transparent text-muted hover:text-text'
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel" id={`users-panel-${tab}`} aria-labelledby={`users-tab-${tab}`} className="p-4 sm:p-6">
        {tab === 'users' && <UsersTab server={server} source={source} />}
        {tab === 'groups' && <GroupsTab server={server} />}
        {tab === 'sessions' && <SessionsTab />}
      </div>
    </div>
  );
}
