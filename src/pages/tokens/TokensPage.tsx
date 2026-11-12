import { useState } from 'react';
import { useSearchParams } from 'react-router';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import { useApi } from '../../hooks/useApi';
import { getApiTokens, revokeApiToken, type ApiTokenView } from '../../api/tokens';
import { useI18n } from '../../i18n';
import { errorMessage, isLinkedTerminal, linkedClient, tokenState } from './tokenInfo';

const BUTTON = 'px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg transition-colors disabled:opacity-40';

/** API tokens of the signed-in user (or of everyone): terminals linked to the server, MCP clients, CI, scripts. */
export default function TokensPage() {
  const { t, formatDate, formatRelative } = useI18n();
  const [params, setParams] = useSearchParams();
  const all = params.get('all') === 'true';
  const { data, loading, error, refetch, refresh } = useApi(async () => ({ tokens: await getApiTokens(all), now: Date.now() }), [all]);
  const [revoking, setRevoking] = useState<ApiTokenView | null>(null);
  const [busy, setBusy] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const tokens = data?.tokens ?? [];
  const linked = tokens.filter(isLinkedTerminal).length;

  const setAll = (value: boolean) => setParams(prev => {
    const next = new URLSearchParams(prev);
    if (value) next.set('all', 'true');
    else next.delete('all');
    return next;
  }, { replace: true });

  function openRevoke(token: ApiTokenView) {
    setRevokeError(null);
    setRevoking(token);
  }

  async function confirmRevoke() {
    if (!revoking) return;
    setBusy(true);
    try {
      await revokeApiToken(revoking.id);
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
          {tk.permissions.map(p => <span key={p} className="font-mono text-[11px] bg-control px-1.5 py-0.5 rounded">{p}</span>)}
        </span>
      ) : <span className="text-xs text-subtle">{t('tokens.allPermissions')}</span>,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (tk: ApiTokenView) => (
        <button
          type="button"
          onClick={() => openRevoke(tk)}
          aria-label={t('tokens.revokeNamed', { name: tk.name })}
          className="px-2 py-1 text-[11px] bg-error/20 hover:bg-error/30 text-error rounded transition-colors"
        >
          {t('tokens.revoke')}
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.tokens')}
        subtitle={data ? t('tokens.subtitle', { count: tokens.length }) + (linked ? ` · ${t('tokens.linkedCount', { count: linked })}` : '') : t('common.loading')}
        actions={
          <>
            <label className="inline-flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} className="accent-primary" />
              {t('tokens.allUsers')}
            </label>
            <button onClick={refetch} className={BUTTON}>{t('common.refresh')}</button>
          </>
        }
      />
      <div className="p-4 sm:p-6 space-y-4">
        <p className="text-xs text-subtle max-w-3xl">{t('tokens.hint')}</p>
        {loading && !data && <div className="text-muted text-sm">{t('tokens.loading')}</div>}
        {error && <div className="text-error text-sm">{t('tokens.error', { message: errorMessage(new Error(error)) })}</div>}
        {data && tokens.length === 0 && !error && (
          <div role="status" className="max-w-lg p-4 rounded-lg bg-surface border border-border text-sm text-muted">{t('tokens.none')}</div>
        )}
        {data && tokens.length > 0 && (
          <DataTable columns={columns} data={tokens} keyExtractor={tk => tk.id} defaultSort={{ key: 'created', direction: 'desc' }} />
        )}
      </div>

      <Modal
        open={revoking !== null}
        onClose={() => !busy && setRevoking(null)}
        title={t('tokens.revokeTitle')}
        actions={
          <>
            <button onClick={() => setRevoking(null)} disabled={busy} className={BUTTON}>{t('common.cancel')}</button>
            <button onClick={() => void confirmRevoke()} disabled={busy}
              className="px-3 py-1.5 text-xs bg-error/20 hover:bg-error/30 text-error rounded-lg transition-colors disabled:opacity-40">
              {busy ? t('tokens.revoking') : t('tokens.revoke')}
            </button>
          </>
        }
      >
        {revoking && (
          <div className="space-y-2">
            <p>{isLinkedTerminal(revoking) ? t('tokens.revokeLinked', { name: linkedClient(revoking) }) : t('tokens.revokeConfirm', { name: revoking.name })}</p>
            {revokeError && <p role="alert" className="text-error text-xs">{revokeError}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
