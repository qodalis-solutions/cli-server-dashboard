import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Badge, DEFAULT_PAGE_SIZE, EmptyState, ErrorState, Pagination } from '@qodalis/cli-server-dashboard-kit';
import { PLUGINS_INSTALL_PERMISSION, getServerMarketplaceInfo, ownPlatform, searchServerPlugins } from '../../api/serverMarketplace';
import { useExtensions } from '../../context/ExtensionsContext';
import { useApi } from '../../hooks/useApi';
import { useI18n } from '../../i18n';
import type { ServerMarketplaceInfo, ServerPlatform, ServerPluginItem } from '../../types';
import { InstalledFilterChips, PlatformFilterChips } from './MarketplaceFilters';
import { installedFilter, platformFilter } from './pluginPath';
import { PublisherLine } from './MarketplaceDetails';
import { ActionButton } from './MarketplaceTab';
import ModuleIconView from './ModuleIconView';
import { BADGE_ROW, InstallStateBadges, TITLE_ROW, VERSION_CHIP } from './InstallState';
import { addedInCode, fromMarketplace, matchesFilters } from './installSource';
import PluginCardsSkeleton from './PluginCardsSkeleton';
import ServerPluginDetails from './ServerPluginDetails';
import { PlatformBadges, SetupNote } from './ServerPluginParts';
import { SEARCH_DELAY } from './marketplaceText';
import { platformLabel, useServerBlockedText, useServerPluginErrorText, useServerPluginsChanged } from './serverPluginText';
import { useServerPluginActions, type ServerPluginAction } from './useServerPluginActions';

const BUTTON = 'px-3 py-1.5 text-xs rounded-lg transition-colors inline-flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60';
const PRIMARY = `${BUTTON} bg-primary text-on-primary hover:bg-primary/90`;
const SECONDARY = `${BUTTON} bg-control hover:bg-control-hover text-text`;
const DANGER = `${BUTTON} bg-control text-error hover:bg-error/10`;

function ServerPluginCard({ plugin, info, viewing, canInstall, busy, working, onAction, onDetails }: {
  plugin: ServerPluginItem;
  info: ServerMarketplaceInfo;
  /** Another platform than this server's, chosen in the filter: shown for it, never installable here. */
  viewing: ServerPlatform | null;
  canInstall: boolean;
  busy: ServerPluginAction | null;
  working: boolean;
  onAction: (action: ServerPluginAction) => void;
  onDetails: () => void;
}) {
  const { t } = useI18n();
  const blockedText = useServerBlockedText();
  const platform = ownPlatform(info, plugin);
  const own = plugin.platform;
  const installed = plugin.installed;
  // Added in code: no Install, Update or Remove (those are for marketplace installs)
  const managedHere = fromMarketplace(installed);
  const blocked = !plugin.allowed ? blockedText(plugin.blockedReason ?? 'install disabled', platform) : undefined;

  return (
    <article aria-label={plugin.title} className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <ModuleIconView icon={plugin.icon} names={[plugin.name]} />
        <div className="flex-1 min-w-0">
          <div className={TITLE_ROW}>
            <h3 className="font-semibold text-heading text-sm truncate min-w-0">{plugin.title}</h3>
            {own?.latest && <span className={VERSION_CHIP}>v{own.latest}</span>}
          </div>
          <PublisherLine plugin={plugin} />
          {viewing
            ? plugin.platforms[viewing] && <div className="text-[11px] text-subtle font-mono mt-0.5 truncate" title={plugin.platforms[viewing]!.package}>{plugin.platforms[viewing]!.package}</div>
            : own && <div className="text-[11px] text-subtle font-mono mt-0.5 truncate" title={own.package}>{own.package}</div>}
          <p className="text-xs text-muted mt-1 line-clamp-2">{plugin.description || t('plugins.noDescription')}</p>
        </div>
      </div>

      <PlatformBadges plugin={plugin} platform={platform} />

      {viewing && (
        <p role="note" data-testid="other-platform" className="text-xs text-muted">
          {t('serverMarketplace.otherPlatformNote', { platform: platformLabel(viewing), own: platformLabel(platform) || t('serverMarketplace.thisServer') })}
        </p>
      )}
      <div className={BADGE_ROW}>
        {viewing && <Badge variant="neutral">{t('serverMarketplace.notInstallableHere')}</Badge>}
        <InstallStateBadges installed={installed} updateAvailable={plugin.updateAvailable} latest={own?.latest ?? null} />
        {!own && !viewing && (
          <Badge variant="neutral">{t('serverMarketplace.notAvailable', { platform: platformLabel(platform) || t('serverMarketplace.thisServer') })}</Badge>
        )}
        {own && !own.compatible && !addedInCode(installed) && (
          <Badge variant="error">{t('serverMarketplace.incompatible', { reason: own.reason ?? t('serverMarketplace.incompatibleUnknown') })}</Badge>
        )}
      </div>
      {own && !viewing && !plugin.autoInstall && !addedInCode(installed) && <SetupNote plugin={plugin} marketplaceUrl={info.marketplaceUrl} />}

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <button type="button" onClick={onDetails} className={SECONDARY} aria-label={t('marketplace.detailsOf', { title: plugin.title })}>
          {t('marketplace.details')}
        </button>
        {canInstall && !viewing && !installed && (
          <ActionButton label={t('marketplace.install')} className={PRIMARY} blocked={blocked}
            busy={busy === 'install'} disabled={working} onClick={() => onAction('install')} />
        )}
        {canInstall && !viewing && managedHere && plugin.updateAvailable && (
          <ActionButton label={t('marketplace.update')} className={PRIMARY} blocked={blocked}
            busy={busy === 'update'} disabled={working} onClick={() => onAction('update')} />
        )}
        {canInstall && !viewing && managedHere && (
          <ActionButton label={t('marketplace.remove')} className={DANGER}
            busy={busy === 'remove'} disabled={working} onClick={() => onAction('remove')} />
        )}
      </div>
    </article>
  );
}

/** The marketplace's server plugins for this server's platform: search, cards, paging; install, update and remove with `plugins:install`. */
function ServerPluginList({ info }: { info: ServerMarketplaceInfo }) {
  const { t } = useI18n();
  const { hasPermission } = useExtensions();
  const reason = useServerPluginErrorText(info.platform);
  const canInstall = hasPermission(PLUGINS_INSTALL_PERMISSION);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [details, setDetails] = useState<ServerPluginItem | null>(null);
  const [params] = useSearchParams();
  const byPlatform = platformFilter(params);
  const byInstalled = installedFilter(params);
  // Another platform than this server's: the cards show it, not installable here
  const viewing = byPlatform !== 'this' && byPlatform !== 'all' && byPlatform !== info.platform ? byPlatform : null;

  useEffect(() => {
    if (search === query) return;
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(0);
    }, SEARCH_DELAY);
    return () => clearTimeout(timer);
  }, [search, query]);

  const fetcher = useCallback(() => searchServerPlugins({ query, page: page + 1, pageSize }), [query, page, pageSize]);
  const { data, loading, error, refetch, refresh } = useApi(fetcher, [fetcher]);
  useServerPluginsChanged(refresh);
  const { run, busy, status } = useServerPluginActions(refresh);
  const platformName = platformLabel(info.platform) || t('serverMarketplace.thisServer');
  const shown = data ? data.items.filter(p => matchesFilters(p, info.platform, byPlatform, byInstalled)) : [];

  return (
    <div className="space-y-4">
      {!info.enabled ? (
        <div role="note" className="rounded-lg border border-border bg-control/40 px-3 py-2 text-xs text-muted">{t('serverMarketplace.disabled')}</div>
      ) : info.install === 'off' && (
        <div role="note" className="rounded-lg border border-border bg-control/40 px-3 py-2 text-xs text-muted">{t('marketplace.installOff')}</div>
      )}
      <input
        type="search"
        placeholder={t('serverMarketplace.search')}
        aria-label={t('serverMarketplace.search')}
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full max-w-sm px-3 py-2 text-sm bg-control border border-border rounded-lg text-text placeholder-subtle focus:outline-none focus:border-primary/50"
      />
      <div className="flex flex-wrap items-center gap-2">
        <PlatformFilterChips platform={info.platform} />
        <InstalledFilterChips />
      </div>
      {status}

      {loading && !data && <PluginCardsSkeleton count={6} label={t('serverMarketplace.loading')} />}
      {error && <ErrorState title={t('serverMarketplace.loadFailed')} error={reason(new Error(error))} onRetry={refetch} />}

      {!error && data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {shown.map(plugin => (
              <ServerPluginCard
                key={plugin.name}
                plugin={plugin}
                info={info}
                viewing={viewing}
                canInstall={canInstall}
                busy={busy?.name === plugin.name ? busy.action : null}
                working={busy !== null}
                onAction={action => void run(action, {
                  name: plugin.name,
                  title: plugin.title,
                  package: plugin.platform?.package ?? plugin.name,
                  publisher: plugin.publisher,
                  version: action === 'remove' ? plugin.platform?.installed : plugin.platform?.latest,
                  platform: ownPlatform(info, plugin),
                })}
                onDetails={() => setDetails(plugin)}
              />
            ))}
            {data.items.length === 0 && (
              <EmptyState
                className="col-span-full bg-surface border border-border rounded-xl"
                message={query.trim() ? t('serverMarketplace.noMatches', { query: query.trim() }) : t('serverMarketplace.empty', { platform: platformName })}
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
      {details && (
        <ServerPluginDetails
          plugin={details}
          platform={ownPlatform(info, details)}
          initialPlatform={viewing}
          marketplaceUrl={info.marketplaceUrl}
          onClose={() => setDetails(null)}
        />
      )}
    </div>
  );
}

/** The Marketplace tab's server plugins; a note on servers that do not install them. */
export default function ServerMarketplaceTab() {
  const { t } = useI18n();
  const info = useApi(getServerMarketplaceInfo, []);
  const reason = useServerPluginErrorText();

  if (info.loading && !info.data) return <PluginCardsSkeleton count={6} label={t('serverMarketplace.loading')} />;
  if (info.error) return <ErrorState title={t('serverMarketplace.loadFailed')} error={reason(new Error(info.error))} onRetry={info.refetch} />;
  if (!info.data) {
    return (
      <EmptyState
        className="bg-surface border border-border rounded-xl"
        message={t('serverMarketplace.unavailable')}
        detail={t('serverMarketplace.unavailableHint')}
      />
    );
  }
  return <ServerPluginList info={info.data} />;
}
