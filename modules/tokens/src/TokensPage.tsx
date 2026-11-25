import { useEffect, useMemo, useState } from 'react';
import {
  Badge, ButtonGroup, ConfirmDialog, DataTable, EmptyState, ErrorState, PageHeader, RevokeIcon, SkeletonTable, Tooltip, useApi, useAsync, useDashboard, useQueryParams,
} from '@qodalis/cli-server-dashboard-kit';
import NewTokenModal from './NewTokenModal';
import { getApiTokens, getPermissions, revokeApiToken, type ApiTokenView, type CliPermission } from './api';
import { useI18n } from './i18n';
import { errorMessage, isLinkedTerminal, linkedClient, tokenState } from './tokenInfo';

const BUTTON = 'px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg transition-colors disabled:opacity-40';
const PRIMARY_BUTTON = 'px-3 py-1.5 text-xs font-medium bg-primary hover:bg-primary-hover text-on-primary rounded-lg transition-colors';

/** API tokens of the signed-in user (or of everyone): terminals linked to the server, MCP clients, CI, scripts. */
export default function TokensPage() {
  const { t, formatDate, formatRelative, formatNumber } = useI18n();
  const api = useApi();
  const { hasPermission } = useDashboard();
  // Every user sees their own tokens; everyone's needs tokens:read
  const canReadAll = hasPermission('tokens:read');
  const [params, setParams] = useQueryParams();
  const all = canReadAll && params.get('all') === 'true';
  const { data, loading, error, refetch, refresh } = useAsync(async () => ({ tokens: await getApiTokens(api, all), now: Date.now() }), [api, all]);
  const [revoking, setRevoking] = useState<ApiTokenView | null>(null);
  const [busy, setBusy] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // The server's permissions: descriptions for the chips, and the new-token dialog's list. Servers before
  // 1.0.0-beta.29 have none (chips stay plain)
  const [catalog, setCatalog] = useState<CliPermission[] | undefined>(undefined);
  const descriptions = useMemo(() => new Map((catalog ?? []).map(e => [e.name.toLowerCase(), e.description])), [catalog]);

  useEffect(() => {
    let active = true;
    getPermissions(api)
      .then(entries => { if (active) setCatalog(entries); })
      .catch(() => {});
    return () => { active = false; };
  }, [api]);

  const tokens = data?.tokens ?? [];
  const linked = tokens.filter(isLinkedTerminal).length;
  // Servers count requests only with their public-api plugin: the column appears when any token has a count
  const counted = tokens.some(tk => tk.usage);

  const setAll = (value: boolean) => setParams(prev => {
    const next = new URLSearchParams(prev);
    if (value) next.set('all', 'true');
    else next.delete('all');
    return next;
  });

  function openRevoke(token: ApiTokenView) {
    setRevokeError(null);
    setRevoking(token);
  }

  async function confirmRevoke() {
    if (!revoking) return;
    setBusy(true);
    try {
      await revokeApiToken(api, revoking.id);
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
      key: 'name',
      header: t('tokens.name'),
      sortValue: (tk: ApiTokenView) => tk.name.toLowerCase(),
      render: (tk: ApiTokenView) => isLinkedTerminal(tk) ? (
        <div className="min-w-[11rem]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span aria-hidden>🔗</span>
            <span className="text-sm text-heading">{linkedClient(tk)}</span>
            <span className="whitespace-nowrap"><Badge variant="info">{t('tokens.linkedTerminal')}</Badge></span>
          </div>
          <div className="text-[11px] font-mono text-subtle mt-0.5">{tk.name}</div>
        </div>
      ) : tk.audience === 'host' ? (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-sm text-accent">{tk.name}</span>
          <span className="whitespace-nowrap" title={t('tokens.hostTokenHint')}><Badge variant="neutral">{t('tokens.hostToken')}</Badge></span>
        </span>
      ) : (
        <span className="font-mono text-sm text-accent">{tk.name}</span>
      ),
    },
    ...(all ? [{
      key: 'owner',
      header: t('tokens.owner'),
      sortValue: (tk: ApiTokenView) => tk.userName,
      render: (tk: ApiTokenView) => <span className="text-xs">{tk.userName}</span>,
    }] : []),
    {
      key: 'created',
      header: t('tokens.created'),
      sortValue: (tk: ApiTokenView) => tk.createdAt,
      render: (tk: ApiTokenView) => <span className="text-xs text-muted whitespace-nowrap" title={formatDate(tk.createdAt)}>{formatDate(tk.createdAt, { dateStyle: 'medium' })}</span>,
    },
    {
      key: 'lastUsed',
      header: t('tokens.lastUsed'),
      sortValue: (tk: ApiTokenView) => tk.lastUsedAt ?? undefined,
      render: (tk: ApiTokenView) => tk.lastUsedAt
        ? <span className="text-xs text-muted whitespace-nowrap" title={formatDate(tk.lastUsedAt)}>{formatRelative(tk.lastUsedAt)}</span>
        : <span className="text-xs text-subtle">{t('tokens.neverUsed')}</span>,
    },
    ...(counted ? [{
      key: 'requestsToday',
      header: t('tokens.requestsToday'),
      className: 'text-right',
      sortValue: (tk: ApiTokenView) => tk.usage?.today,
      render: (tk: ApiTokenView) => tk.usage ? (
        <Tooltip content={() => t('tokens.last30Days', { total: formatNumber(tk.usage!.last30Days) })}>
          {describedBy => (
            <span tabIndex={0} aria-describedby={describedBy} className="text-xs tabular-nums text-text rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
              {formatNumber(tk.usage!.today)}
            </span>
          )}
        </Tooltip>
      ) : <span className="text-xs text-subtle">–</span>,
    }] : []),
    {
      key: 'expires',
      header: t('tokens.expires'),
      sortValue: (tk: ApiTokenView) => tk.expiresAt ?? Number.MAX_SAFE_INTEGER,
      render: (tk: ApiTokenView) => {
        if (tk.expiresAt === null) return <span className="text-xs text-subtle">{t('tokens.neverExpires')}</span>;
        const state = tokenState(tk, data?.now ?? 0);
        return (
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted whitespace-nowrap" title={formatDate(tk.expiresAt)}>
            {formatDate(tk.expiresAt, { dateStyle: 'medium' })}
            {state === 'expired' && <Badge variant="error">{t('tokens.expired')}</Badge>}
            {state === 'expiring' && <Badge variant="warning">{t('tokens.expiringSoon')}</Badge>}
          </span>
        );
      },
    },
    {
      key: 'permissions',
      header: t('tokens.permissions'),
      render: (tk: ApiTokenView) => tk.permissions?.length ? (
        <span className="flex flex-wrap gap-1 max-w-[18rem]">
          {tk.permissions.map(p => (
            <span key={p} title={descriptions.get(p.toLowerCase())} className="font-mono text-[11px] bg-control px-1.5 py-0.5 rounded">{p}</span>
          ))}
        </span>
      ) : <span className="text-xs text-subtle">{t('tokens.allPermissions')}</span>,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (tk: ApiTokenView) => (
        <ButtonGroup
          label={t('tokens.rowActions', { name: tk.name })}
          labels="sm"
          items={[{
            key: 'revoke', label: t('tokens.revoke'), ariaLabel: t('tokens.revokeNamed', { name: tk.name }), icon: <RevokeIcon />,
            tone: 'danger', disabled: busy && revoking?.id === tk.id, onClick: () => openRevoke(tk),
          }]}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('tokens.title')}
        subtitle={data ? t('tokens.subtitle', { count: tokens.length }) + (linked ? ` · ${t('tokens.linkedCount', { count: linked })}` : '') : t('tokens.loadingPage')}
        actions={
          <>
            {canReadAll && (
              <label className="inline-flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} className="accent-primary" />
                {t('tokens.allUsers')}
              </label>
            )}
            <button onClick={refetch} className={BUTTON}>{t('tokens.refresh')}</button>
            <button onClick={() => setCreating(true)} className={PRIMARY_BUTTON}>{t('tokens.newToken')}</button>
          </>
        }
      />
      <div className="p-4 sm:p-6 space-y-4">
        <p className="text-xs text-subtle max-w-3xl">{t('tokens.hint')}</p>
        {loading && !data && <SkeletonTable rows={4} columns={columns.length} label={t('tokens.loading')} />}
        {error && <ErrorState title={t('tokens.error', { message: errorMessage(new Error(error)) })} onRetry={refetch} />}
        {data && tokens.length === 0 && !error && (
          <div role="status"><EmptyState className="bg-surface border border-border rounded-xl" message={t('tokens.none')} /></div>
        )}
        {data && tokens.length > 0 && (
          <DataTable columns={columns} data={tokens} keyExtractor={tk => tk.id} defaultSort={{ key: 'created', direction: 'desc' }} />
        )}
      </div>

      <NewTokenModal open={creating} onClose={() => setCreating(false)} onCreated={() => refresh()} catalog={catalog} />

      <ConfirmDialog
        open={revoking !== null}
        tone="danger"
        title={t('tokens.revokeTitle')}
        message={revoking && (isLinkedTerminal(revoking) ? t('tokens.revokeLinked', { name: linkedClient(revoking) }) : t('tokens.revokeConfirm', { name: revoking.name }))}
        confirmLabel={t('tokens.revoke')}
        busyLabel={t('tokens.revoking')}
        busy={busy}
        error={revokeError}
        onConfirm={confirmRevoke}
        onCancel={() => setRevoking(null)}
      />
    </div>
  );
}
