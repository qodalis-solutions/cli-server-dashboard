import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Badge, ButtonGroup, DEFAULT_PAGE_SIZE, EmptyState, ErrorState, Pagination, Spinner, Tooltip } from '@qodalis/cli-server-dashboard-kit';
import { INSTALL_PERMISSION, getMarketplaceInfo, searchMarketplace } from '../../api/marketplace';
import { useExtensions } from '../../context/ExtensionsContext';
import { useApi, type AsyncResult } from '../../hooks/useApi';
import { useI18n } from '../../i18n';
import type { MarketplaceInfo, MarketplacePluginItem } from '../../types';
import MarketplaceDetails, { PublisherLine } from './MarketplaceDetails';
import ModuleIconView from './ModuleIconView';
import { BADGE_ROW, InstallStateBadges, TITLE_ROW, VERSION_CHIP } from './InstallState';
import { fromMarketplace } from './installSource';
import PluginCardsSkeleton from './PluginCardsSkeleton';
import { useMarketplaceActions, type MarketplaceAction } from './useMarketplaceActions';
import { marketplaceKind, marketplaceSite, type MarketplaceKind } from './pluginPath';
import ServerMarketplaceTab from './ServerMarketplaceTab';
import { InstalledFilterChips } from './MarketplaceFilters';
import { installedFilter } from './pluginPath';
import { SEARCH_DELAY, useBlockedText, useExtensionsChanged, useMarketplaceErrorText } from './marketplaceText';

const BUTTON = 'px-3 py-1.5 text-xs rounded-lg transition-colors inline-flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60';
const PRIMARY = `${BUTTON} bg-primary text-on-primary hover:bg-primary/90`;
const SECONDARY = `${BUTTON} bg-control hover:bg-control-hover text-text`;
const DANGER = `${BUTTON} bg-control text-error hover:bg-error/10`;
const BLOCKED = 'opacity-50 cursor-not-allowed';

/**
 * An action button; when the server does not allow it, it stays focusable but does nothing, with the reason as its
 * tooltip. A spinner replaces nothing: it is shown next to the label while this action runs.
 */
export function ActionButton({ label, className, onClick, blocked, busy, disabled }: {
  label: string;
  className: string;
  onClick: () => void;
  blocked?: string;
  busy?: boolean;
  disabled?: boolean;
}) {
  if (blocked) {
    return (
      <Tooltip content={() => blocked}>
        {describedBy => (
          <button type="button" aria-disabled="true" aria-describedby={describedBy} className={`${className} ${BLOCKED}`}>
            {label}
          </button>
        )}
      </Tooltip>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled || busy} className={`${className} disabled:opacity-50`}>
      {busy && <Spinner />}
      {label}
    </button>
  );
}

function MarketplaceCard({ plugin, canInstall, busy, working, onAction, onDetails }: {
  plugin: MarketplacePluginItem;
  canInstall: boolean;
  /** The action running on this plugin. */
  busy: MarketplaceAction | null;
  /** Some action is running (on any plugin). */
  working: boolean;
  onAction: (action: MarketplaceAction) => void;
  onDetails: () => void;
}) {
  const { t } = useI18n();
  const blockedText = useBlockedText();
  const blocked = !plugin.allowed ? blockedText(plugin.blockedReason ?? 'install disabled') : undefined;
  const installed = plugin.installed;
  // Added in code: no Install, Update or Remove (those are for marketplace installs)
  const managedHere = fromMarketplace(installed);

  return (
    <article aria-label={plugin.title} className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <ModuleIconView icon={plugin.icon} names={[plugin.name]} />
        <div className="flex-1 min-w-0">
          <div className={TITLE_ROW}>
            <h3 className="font-semibold text-heading text-sm truncate min-w-0">{plugin.title}</h3>
            {plugin.latest && <span className={VERSION_CHIP}>v{plugin.latest}</span>}
          </div>
          <PublisherLine plugin={plugin} />
          <p className="text-xs text-muted mt-1 line-clamp-2">{plugin.description || t('plugins.noDescription')}</p>
        </div>
      </div>

      <div className={BADGE_ROW}>
        <InstallStateBadges installed={installed} updateAvailable={plugin.updateAvailable} latest={plugin.latest} />
        {plugin.requires && !plugin.requires.installed && (
          <Badge variant="warning">⚠ {t('marketplace.needsServerPlugin', { name: plugin.requires.serverPackage })}</Badge>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <button type="button" onClick={onDetails} className={SECONDARY} aria-label={t('marketplace.detailsOf', { title: plugin.title })}>
          {t('marketplace.details')}
        </button>
        {canInstall && !installed && (
          <ActionButton label={t('marketplace.install')} className={PRIMARY} blocked={blocked}
            busy={busy === 'install'} disabled={working} onClick={() => onAction('install')} />
        )}
        {canInstall && managedHere && plugin.updateAvailable && (
          <ActionButton label={t('marketplace.update')} className={PRIMARY} blocked={blocked}
            busy={busy === 'update'} disabled={working} onClick={() => onAction('update')} />
        )}
        {canInstall && managedHere && (
          <ActionButton label={t('marketplace.remove')} className={DANGER}
            busy={busy === 'remove'} disabled={working} onClick={() => onAction('remove')} />
        )}
      </div>
    </article>
  );
}

/** The marketplace's dashboard plugins: search, a page of cards, paging; install, update and remove with the permission. */
function MarketplaceList({ info }: { info: MarketplaceInfo }) {
  const { t } = useI18n();
  const { hasPermission } = useExtensions();
  const reason = useMarketplaceErrorText();
  const canInstall = hasPermission(INSTALL_PERMISSION);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [details, setDetails] = useState<MarketplacePluginItem | null>(null);
  const [params] = useSearchParams();
  const byInstalled = installedFilter(params);

  // The server is asked once typing pauses, from the first page
  useEffect(() => {
    if (search === query) return;
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(0);
    }, SEARCH_DELAY);
    return () => clearTimeout(timer);
  }, [search, query]);

  const fetcher = useCallback(() => searchMarketplace({ query, page: page + 1, pageSize }), [query, page, pageSize]);
  const { data, loading, error, refetch, refresh } = useApi(fetcher, [fetcher]);
  useExtensionsChanged(refresh);
  const { run, busy, status } = useMarketplaceActions(refresh);
  // Installed (from the marketplace or in code) or not: filtered on the page the server sent
  const shown = (data?.items ?? []).filter(p => byInstalled === 'any' || (byInstalled === 'yes') === !!p.installed);

  return (
    <div className="space-y-4">
      {info.install === 'off' && (
        <div role="note" className="rounded-lg border border-border bg-control/40 px-3 py-2 text-xs text-muted">
          {t('marketplace.installOff')}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder={t('marketplace.search')}
          aria-label={t('marketplace.search')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-auto sm:flex-1 sm:min-w-[16rem] max-w-sm px-3 py-2 text-sm bg-control border border-border rounded-lg text-text placeholder-subtle focus:outline-none focus:border-primary/50"
        />
        <InstalledFilterChips />
      </div>
      {status}

      {loading && !data && <PluginCardsSkeleton count={6} label={t('marketplace.loading')} />}
      {error && <ErrorState title={t('marketplace.loadFailed')} error={reason(new Error(error))} onRetry={refetch} />}

      {!error && data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {shown.map(plugin => (
              <MarketplaceCard
                key={plugin.name}
                plugin={plugin}
                canInstall={canInstall}
                busy={busy?.name === plugin.name ? busy.action : null}
                working={busy !== null}
                onAction={action => void run(action, { name: plugin.name, title: plugin.title, publisher: plugin.publisher.name, requires: plugin.requires })}
                onDetails={() => setDetails(plugin)}
              />
            ))}
            {data.items.length === 0 && (
              <EmptyState
                className="col-span-full bg-surface border border-border rounded-xl"
                message={query.trim() ? t('marketplace.noMatches', { query: query.trim() }) : t('marketplace.empty')}
              />
            )}
            {data.items.length > 0 && shown.length === 0 && (
              <EmptyState className="col-span-full bg-surface border border-border rounded-xl" message={t('marketplace.filterNoMatches')} />
            )}
          </div>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={data.total}
            onPage={setPage}
            onPageSize={size => { setPageSize(size); setPage(0); }}
          />
        </>
      )}
      {details && <MarketplaceDetails plugin={details} onClose={() => setDetails(null)} />}
    </div>
  );
}

/** The dashboard plugins of the Marketplace tab; a note on servers that have no marketplace. */
function DashboardMarketplace({ info }: { info: AsyncResult<MarketplaceInfo | null> }) {
  const { t } = useI18n();
  const reason = useMarketplaceErrorText();

  if (info.loading && !info.data) return <PluginCardsSkeleton count={6} label={t('marketplace.loading')} />;
  if (info.error) return <ErrorState title={t('marketplace.loadFailed')} error={reason(new Error(info.error))} onRetry={info.refetch} />;
  if (!info.data) {
    return (
      <EmptyState
        className="bg-surface border border-border rounded-xl"
        message={t('marketplace.unavailable')}
        detail={t('marketplace.unavailableHint')}
      />
    );
  }
  return <MarketplaceList info={info.data} />;
}

const KINDS: ReadonlyArray<{ id: MarketplaceKind; label: 'serverMarketplace.kindDashboard' | 'serverMarketplace.kindServer' }> = [
  { id: 'dashboard', label: 'serverMarketplace.kindDashboard' },
  { id: 'server', label: 'serverMarketplace.kindServer' },
];

/**
 * The Plugins page's Marketplace tab: a switch between dashboard plugins and server plugins, kept in the URL
 * (`?tab=marketplace&kind=server`; dashboard plugins without `kind`).
 */
export default function MarketplaceTab() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const kind = marketplaceKind(params);
  const info = useApi(getMarketplaceInfo, []);
  const site = marketplaceSite(info.data?.marketplaceUrl, kind);
  const select = (next: MarketplaceKind) => setParams(prev => {
    const query = new URLSearchParams(prev);
    if (next === 'dashboard') query.delete('kind');
    else query.set('kind', next);
    return query;
  }, { replace: true });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ButtonGroup
          label={t('serverMarketplace.kindSwitch')}
          items={KINDS.map(item => ({
            key: item.id,
            label: t(item.label),
            pressed: kind === item.id,
            tone: kind === item.id ? 'primary' : 'default',
            onClick: () => select(item.id),
          }))}
        />
        {site && (
          <a href={site.href} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">
            {t('serverMarketplace.browseSite', { host: site.host })} ↗
          </a>
        )}
      </div>
      {kind === 'server' ? <ServerMarketplaceTab /> : <DashboardMarketplace info={info} />}
    </div>
  );
}
