import { ErrorState, SkeletonStatCards, StatCard, type AsyncResult } from '@qodalis/cli-server-dashboard-kit';
import { errorMessage, type Group, type Session, type User } from './api';
import { useI18n } from './i18n';
import { userStats } from './stats';

/** What the users page loads once for its statistics and the users tab. */
export interface UsersData {
  users: User[];
  /** Null: the groups could not be read. */
  groups: Group[] | null;
  /** Null: not permitted (`sessions:read`) or could not be read. */
  sessions: Session[] | null;
  /** When the data was read (Unix ms): the reference of "7 days", "30 days" and unexpired sessions. */
  at: number;
}

const GRID = 'grid grid-cols-2 lg:grid-cols-4 gap-4';

/**
 * The users page's statistics: users (disabled), active in 7 days (never signed in), signed in now (`sessions:read`) or
 * new in 30 days, and groups (custom). The cards stay while the data refreshes; a failure shows a compact error with
 * Retry, unless `hideError` (the users tab shows it already).
 */
export default function UsersStats({ source, hideError = false }: { source: AsyncResult<UsersData>; hideError?: boolean }) {
  const { t, formatNumber } = useI18n();
  const { data, loading, error, refetch } = source;

  if (!data) {
    if (loading) {
      return (
        <div className={GRID}>
          <SkeletonStatCards count={4} inRow label={t('users.statsLoading')} />
        </div>
      );
    }
    if (error && !hideError) {
      return <ErrorState compact title={t('users.statsError', { message: errorMessage(new Error(error)) })} onRetry={refetch} />;
    }
    return null;
  }

  const s = userStats(data.users, data.groups, data.sessions, data.at);
  return (
    <section aria-label={t('users.statistics')} className={GRID}>
      <StatCard label={t('users.tabUsers')} value={formatNumber(s.users)} sub={t('users.statDisabled', { count: s.disabled })} />
      <StatCard label={t('users.statActive')} value={formatNumber(s.active)} sub={t('users.statNeverSignedIn', { count: s.neverSignedIn })} />
      {s.sessions ? (
        <StatCard label={t('users.statSignedIn')} value={formatNumber(s.sessions.total)} sub={t('users.count', { count: s.sessions.users })} />
      ) : (
        <StatCard
          label={t('users.statNew')}
          value={formatNumber(s.created)}
          sub={t('users.statMustChange', { count: s.mustChangePassword })}
          subColor={s.mustChangePassword > 0 ? 'text-warning' : undefined}
        />
      )}
      {s.groups && (
        <StatCard label={t('users.tabGroups')} value={formatNumber(s.groups.total)} sub={t('users.statCustomGroups', { count: s.groups.custom })} />
      )}
    </section>
  );
}
