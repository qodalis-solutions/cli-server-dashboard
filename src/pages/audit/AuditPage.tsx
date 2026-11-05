import { useCallback, useState, type FormEvent } from 'react';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import DataTable from '../../components/DataTable';
import { useApi } from '../../hooks/useApi';
import { formatProperties, getAudit, type AuditQuery } from '../../api/audit';
import type { AuditEntryDto } from '../../types';
import { useI18n } from '../../i18n';

const PAGE_SIZE = 50;

type Filters = Pick<AuditQuery, 'event' | 'actor' | 'username'>;

function eventVariant(event: string): 'error' | 'warning' | 'info' | 'neutral' {
  if (/fail|denied|locked|revoked/i.test(event)) return 'error';
  if (/delete|remove|disable|clear/i.test(event)) return 'warning';
  if (/create|add|login|open/i.test(event)) return 'info';
  return 'neutral';
}

/** The users plugin's audit log, newest first, with filters and paging. */
export default function AuditPage() {
  const { t, formatDate } = useI18n();
  const [draft, setDraft] = useState<Filters>({});
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(0);

  // One entry more than a page tells whether another page follows.
  const load = useCallback(
    () => getAudit({ ...filters, limit: PAGE_SIZE + 1, offset: page * PAGE_SIZE }),
    [filters, page],
  );
  const { data, loading, error, refetch } = useApi(load, [load]);
  const entries = (data ?? []).slice(0, PAGE_SIZE);
  const hasMore = (data?.length ?? 0) > PAGE_SIZE;

  function apply(e: FormEvent) {
    e.preventDefault();
    setPage(0);
    setFilters({ ...draft });
  }

  function clear() {
    setDraft({});
    setPage(0);
    setFilters({});
  }

  const columns = [
    {
      key: 'timestamp',
      header: t('audit.time'),
      render: (e: AuditEntryDto) => <span className="text-xs text-muted whitespace-nowrap">{formatDate(e.timestamp)}</span>,
    },
    {
      key: 'event',
      header: t('audit.event'),
      render: (e: AuditEntryDto) => <Badge variant={eventVariant(e.event)}>{e.event}</Badge>,
    },
    {
      key: 'actor',
      header: t('audit.actor'),
      render: (e: AuditEntryDto) => <span className="text-xs">{e.actor || '—'}</span>,
    },
    {
      key: 'subject',
      header: t('audit.subject'),
      render: (e: AuditEntryDto) => (
        <span className="text-xs">
          {e.username || null}
          {e.username && e.target ? ' · ' : null}
          {e.target ? <span className="font-mono text-muted">{e.target}</span> : null}
          {!e.username && !e.target ? '—' : null}
        </span>
      ),
    },
    {
      key: 'details',
      header: t('audit.details'),
      render: (e: AuditEntryDto) => {
        const values = formatProperties(e.properties);
        return (
          <div className="text-xs max-w-[360px]">
            {e.details && <div className="text-muted truncate" title={e.details}>{e.details}</div>}
            {values.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {values.map(v => (
                  <span key={v} className="font-mono text-[11px] bg-control px-1.5 py-0.5 rounded truncate max-w-[200px]" title={v}>{v}</span>
                ))}
              </div>
            )}
            {!e.details && values.length === 0 && <span className="text-subtle">—</span>}
          </div>
        );
      },
    },
    {
      key: 'address',
      header: t('audit.address'),
      render: (e: AuditEntryDto) => <span className="text-xs font-mono text-subtle">{e.metadata?.remoteAddress ?? '—'}</span>,
    },
  ];

  const input = 'px-2.5 py-1.5 text-xs bg-control border border-border rounded-lg text-text placeholder:text-subtle w-40';

  return (
    <div>
      <PageHeader
        title={t('nav.audit')}
        subtitle={t('audit.subtitle')}
        actions={
          <button onClick={refetch} className="px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg transition-colors">
            {t('common.refresh')}
          </button>
        }
      />
      <div className="p-6 space-y-4">
        <form onSubmit={apply} className="flex flex-wrap items-center gap-2">
          <input aria-label={t('audit.filterEvent')} placeholder={t('audit.filterEvent')} className={input}
            value={draft.event ?? ''} onChange={e => setDraft({ ...draft, event: e.target.value })} />
          <input aria-label={t('audit.filterActor')} placeholder={t('audit.filterActor')} className={input}
            value={draft.actor ?? ''} onChange={e => setDraft({ ...draft, actor: e.target.value })} />
          <input aria-label={t('audit.filterUser')} placeholder={t('audit.filterUser')} className={input}
            value={draft.username ?? ''} onChange={e => setDraft({ ...draft, username: e.target.value })} />
          <button type="submit" className="px-3 py-1.5 text-xs bg-primary text-on-primary rounded-lg">{t('audit.apply')}</button>
          <button type="button" onClick={clear} className="px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg">
            {t('audit.clearFilters')}
          </button>
        </form>

        {loading && !data && <div className="text-muted text-sm">{t('audit.loading')}</div>}
        {error && <div className="text-error text-sm">{t('audit.error', { message: error })}</div>}
        {!error && data && (
          <DataTable columns={columns} data={entries} keyExtractor={e => e.id} />
        )}

        {(page > 0 || hasMore) && (
          <div className="flex items-center justify-end gap-2 text-xs">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 bg-control hover:bg-control-hover text-text rounded-lg disabled:opacity-40">
              {t('audit.previous')}
            </button>
            <span className="text-muted">{t('audit.page', { page: page + 1 })}</span>
            <button disabled={!hasMore} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 bg-control hover:bg-control-hover text-text rounded-lg disabled:opacity-40">
              {t('audit.next')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
