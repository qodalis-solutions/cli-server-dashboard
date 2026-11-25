import { useCallback, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import { useApi, type AsyncResult } from '../../hooks/useApi';
import { getInstalledPlugins, getPlugins, togglePlugin } from '../../api/plugins';
import type { InstalledPluginDto, PluginInfo } from '../../types';
import { useI18n, type MessageKey } from '../../i18n';
import { serverMessage } from '../../api/auth';
import ModuleIconView from './ModuleIconView';
import PluginToggle from './PluginToggle';
import { pluginPath, pluginsTab, type PluginsPageState, type PluginsTab } from './pluginPath';
import PluginCardsSkeleton from './PluginCardsSkeleton';
import MarketplaceTab, { ActionButton } from './MarketplaceTab';
import Notice from './Notice';
import { useMarketplaceActions } from './useMarketplaceActions';
import { useExtensionsChanged } from './marketplaceText';
import { DASHBOARD_PLUGINS_PROVIDER, getMarketplaceInstalled, INSTALL_PERMISSION, pluginSettingsPath } from '../../api/marketplace';
import { getConfig } from '../../api/config';
import { extensionPath } from '../../components/navItems';
import { useExtensions } from '../../context/ExtensionsContext';
import type { InstalledServerPlugin, InstalledServerPluginStatus, MarketplaceInstalledPlugin } from '../../types';
import { getInstalledServerPlugins, PLUGINS_INSTALL_PERMISSION, serverPluginSettingsPath } from '../../api/serverMarketplace';
import { useServerPluginsChanged } from './serverPluginText';
import { useServerPluginActions } from './useServerPluginActions';
import { EmptyState, ErrorState } from '@qodalis/cli-server-dashboard-kit';

/** The card's link and its look: the whole card opens the details page, with a hover and a keyboard focus ring. */
const CARD_LINK = 'block h-full bg-surface border rounded-xl transition-colors hover:border-primary/50 hover:bg-control/40 '
  + 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60';

function PluginCard({ plugin, onToggle }: { plugin: PluginInfo; onToggle: (id: string) => Promise<void> }) {
  const processorCount = plugin.processorCount ?? plugin.processors?.length ?? 0;
  const { t, formatNumber } = useI18n();

  return (
    // The switch is next to the link, not in it: toggling never opens the page
    <div className={`relative ${plugin.enabled ? '' : 'opacity-60 hover:opacity-80'}`}>
      <Link
        to={pluginPath(plugin.id)}
        className={`${CARD_LINK} p-4 ${plugin.enabled ? 'border-border' : 'border-border/50'}`}
      >
        <div className="flex items-start justify-between gap-3">
          <ModuleIconView icon={plugin.icon} names={[plugin.id, plugin.name]} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-heading text-sm truncate">{plugin.name || plugin.id}</span>
              <span className="text-[10px] text-subtle font-mono bg-control px-1.5 py-0.5 rounded">
                v{plugin.version}
              </span>
            </div>
            <p className="text-xs text-muted mt-1 line-clamp-2">{plugin.description || t('plugins.noDescription')}</p>
          </div>
          <div className="shrink-0">
            <Badge variant={plugin.enabled ? 'success' : 'neutral'} dot>
              {plugin.enabled ? t('common.enabled') : t('common.disabled')}
            </Badge>
          </div>
        </div>

        <div className="text-[11px] text-subtle mt-3 pr-12">
          <span className="text-text font-medium">{formatNumber(processorCount)}</span>
          {' '}{t('plugins.processorUnit', { count: processorCount })}
        </div>
      </Link>
      <PluginToggle enabled={plugin.enabled} onToggle={() => onToggle(plugin.id)} className="absolute bottom-4 right-4" />
    </div>
  );
}

function InstalledPluginCard({ plugin }: { plugin: InstalledPluginDto }) {
  const { t } = useI18n();
  return (
    <Link to={pluginPath(plugin.id)} className={`${CARD_LINK} border-border p-4 flex items-start gap-3`}>
      <ModuleIconView icon={plugin.icon} names={[plugin.id, plugin.name]} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-heading text-sm truncate">{plugin.name || plugin.id}</span>
          {plugin.version && (
            <span className="text-[10px] text-subtle font-mono bg-control px-1.5 py-0.5 rounded">v{plugin.version}</span>
          )}
        </div>
        <div className="text-[11px] text-subtle font-mono mt-0.5 truncate" title={plugin.id}>{plugin.id}</div>
        <p className="text-xs text-muted mt-1 line-clamp-2">{plugin.description || t('plugins.noDescription')}</p>
      </div>
    </Link>
  );
}

/**
 * A dashboard plugin installed from the marketplace: its page, a Marketplace badge, its settings on the Config page,
 * Update and Remove.
 */
function MarketplaceInstalledCard({ plugin, hasSettings, canInstall, busy, working, onAction }: {
  plugin: MarketplaceInstalledPlugin;
  /** It has a section in the `dashboard-plugins` config provider. */
  hasSettings: boolean;
  canInstall: boolean;
  busy: 'install' | 'update' | 'remove' | null;
  working: boolean;
  onAction: (action: 'update' | 'remove') => void;
}) {
  const { t } = useI18n();
  const title = plugin.title || plugin.name;
  return (
    <article aria-label={title} className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <ModuleIconView icon={plugin.icon} names={[plugin.id, plugin.name]} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {plugin.id
              ? <Link to={extensionPath(plugin.id)} className="font-semibold text-heading text-sm truncate hover:underline">{title}</Link>
              : <span className="font-semibold text-heading text-sm truncate">{title}</span>}
            {plugin.version && (
              <span className="text-[10px] text-subtle font-mono bg-control px-1.5 py-0.5 rounded">v{plugin.version}</span>
            )}
          </div>
          <div className="text-[11px] text-subtle font-mono mt-0.5 truncate" title={plugin.name}>{plugin.name}</div>
          {plugin.installedBy && <div className="text-[11px] text-subtle mt-0.5">{t('marketplace.installedBy', { user: plugin.installedBy })}</div>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="info">{t('marketplace.badge')}</Badge>
        {plugin.updateAvailable && <Badge variant="warning">{t('marketplace.updateAvailable')}</Badge>}
      </div>
      {(canInstall || (hasSettings && plugin.id)) && (
        <div className="flex flex-wrap items-center gap-2">
          {hasSettings && plugin.id && (
            <Link to={pluginSettingsPath(plugin.id)} className={ACTION_SECONDARY} aria-label={t('marketplace.settingsOf', { title })}>
              {t('marketplace.settings')}
            </Link>
          )}
          {canInstall && plugin.updateAvailable && (
            <ActionButton label={t('marketplace.update')} className={ACTION_PRIMARY} busy={busy === 'update'} disabled={working}
              onClick={() => onAction('update')} />
          )}
          {canInstall && (
            <ActionButton label={t('marketplace.remove')} className={ACTION_DANGER} busy={busy === 'remove'} disabled={working}
              onClick={() => onAction('remove')} />
          )}
        </div>
      )}
    </article>
  );
}

const ACTION = 'px-3 py-1.5 text-xs rounded-lg transition-colors inline-flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60';
const ACTION_PRIMARY = `${ACTION} bg-primary text-on-primary hover:bg-primary/90`;
const ACTION_DANGER = `${ACTION} bg-control text-error hover:bg-error/10`;
const ACTION_SECONDARY = `${ACTION} bg-control hover:bg-control-hover text-text`;

/**
 * The ids of the installed dashboard plugins that have settings (their sections of the `dashboard-plugins` config
 * provider); null when the settings could not be read (every card links then: the Config page says what it finds).
 */
async function pluginSettingSections(): Promise<ReadonlySet<string> | null> {
  try {
    const provider = (await getConfig()).find(p => p.id === DASHBOARD_PLUGINS_PROVIDER);
    return new Set(provider?.sections.map(s => s.id) ?? []);
  } catch {
    return null;
  }
}

/** The marketplace's plugins installed on this server, above the server's own plugins; nothing when there are none. */
function MarketplaceInstalledSection({ installed }: { installed: AsyncResult<MarketplaceInstalledPlugin[]> }) {
  const { t } = useI18n();
  const canInstall = useExtensions().hasPermission(INSTALL_PERMISSION);
  const { run, busy, status } = useMarketplaceActions(installed.refresh);
  const hasPlugins = !!installed.data?.length;
  const sectionsFetcher = useCallback(
    () => (hasPlugins ? pluginSettingSections() : Promise.resolve(new Set<string>())),
    // Read again whenever the installed list is (a plugin installed or updated gets or changes its section)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasPlugins, installed.data],
  );
  const sections = useApi(sectionsFetcher, [sectionsFetcher]);
  if (!hasPlugins && !busy) return <>{status}</>;
  return (
    <section className="space-y-3">
      <SectionTitle title={t('marketplace.installedTitle')} hint={t('marketplace.installedHint')} />
      {status}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {(installed.data ?? []).map(plugin => (
          <MarketplaceInstalledCard
            key={plugin.name}
            plugin={plugin}
            hasSettings={sections.data === null || !!sections.data?.has(plugin.id)}
            canInstall={canInstall}
            busy={busy?.name === plugin.name ? busy.action : null}
            working={busy !== null}
            onAction={action => void run(action, { name: plugin.name, title: plugin.title })}
          />
        ))}
      </div>
    </section>
  );
}

const STATUS: Record<InstalledServerPluginStatus, { key: MessageKey; variant: 'success' | 'warning' | 'error' | 'neutral' | 'info' }> = {
  loaded: { key: 'serverMarketplace.statusLoaded', variant: 'success' },
  pending: { key: 'serverMarketplace.statusPending', variant: 'warning' },
  failed: { key: 'serverMarketplace.statusFailed', variant: 'error' },
  skipped: { key: 'serverMarketplace.statusSkipped', variant: 'neutral' },
  removed: { key: 'serverMarketplace.statusRemoved', variant: 'neutral' },
  'needs-configuration': { key: 'serverMarketplace.statusNeedsConfiguration', variant: 'warning' },
};

/**
 * A server plugin installed from the marketplace: a Marketplace badge, how it runs (loaded, pending a restart, failed
 * with the error of its last start, skipped, removed, needs configuration with Configure), Update and Remove.
 */
function ServerPluginInstalledCard({ plugin, canInstall, busy, working, onAction }: {
  plugin: InstalledServerPlugin;
  canInstall: boolean;
  busy: 'install' | 'update' | 'remove' | null;
  working: boolean;
  onAction: (action: 'update' | 'remove') => void;
}) {
  const { t } = useI18n();
  const title = plugin.title || plugin.name;
  const status = STATUS[plugin.status];
  const removed = plugin.status === 'removed';
  return (
    <article aria-label={title} className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <ModuleIconView icon={plugin.icon} names={[plugin.package, plugin.name]} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {plugin.status === 'loaded'
              ? <Link to={pluginPath(plugin.package)} className="font-semibold text-heading text-sm truncate hover:underline">{title}</Link>
              : <span className="font-semibold text-heading text-sm truncate">{title}</span>}
            {plugin.version && (
              <span className="text-[10px] text-subtle font-mono bg-control px-1.5 py-0.5 rounded">v{plugin.version}</span>
            )}
          </div>
          <div className="text-[11px] text-subtle font-mono mt-0.5 truncate" title={plugin.package}>{plugin.package}</div>
          {plugin.loadedVersion && plugin.loadedVersion !== plugin.version && (
            <div className="text-[11px] text-subtle mt-0.5">{t('serverMarketplace.runningVersion', { version: plugin.loadedVersion })}</div>
          )}
          {plugin.installedBy && <div className="text-[11px] text-subtle mt-0.5">{t('marketplace.installedBy', { user: plugin.installedBy })}</div>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="info">{t('marketplace.badge')}</Badge>
        <span data-testid="load-status"><Badge variant={status.variant} dot>{t(status.key)}</Badge></span>
        {plugin.updateAvailable && !removed && <Badge variant="warning">{t('marketplace.updateAvailable')}</Badge>}
      </div>
      {plugin.error && (plugin.status === 'failed' || plugin.status === 'skipped') && (
        <div role="alert" className="rounded-lg border border-error/30 bg-error/[0.06] px-3 py-2 text-xs">
          <div className="font-medium text-error">{t('serverMarketplace.loadError')}</div>
          <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] text-text">{plugin.error}</pre>
        </div>
      )}
      {plugin.status === 'needs-configuration' && (
        <p className="text-xs text-warning">{t('serverMarketplace.needsConfigurationHint')}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {plugin.status === 'needs-configuration' && (
          <Link to={serverPluginSettingsPath(plugin)} className={ACTION_PRIMARY} aria-label={t('serverMarketplace.configureOf', { title })}>
            {t('serverMarketplace.configure')}
          </Link>
        )}
        {canInstall && plugin.updateAvailable && !removed && (
          <ActionButton label={t('marketplace.update')} className={ACTION_PRIMARY} busy={busy === 'update'} disabled={working}
            onClick={() => onAction('update')} />
        )}
        {canInstall && !removed && (
          <ActionButton label={t('marketplace.remove')} className={ACTION_DANGER} busy={busy === 'remove'} disabled={working}
            onClick={() => onAction('remove')} />
        )}
      </div>
    </article>
  );
}

/** The server plugins installed from the marketplace; nothing when there are none. */
function ServerPluginsInstalledSection({ installed }: { installed: AsyncResult<InstalledServerPlugin[]> }) {
  const { t } = useI18n();
  const canInstall = useExtensions().hasPermission(PLUGINS_INSTALL_PERMISSION);
  const { run, busy, status } = useServerPluginActions(installed.refresh);
  if (installed.error) return <ErrorState title={t('serverMarketplace.loadFailed')} error={installed.error} onRetry={installed.refetch} compact />;
  if (!installed.data?.length && !busy) return <>{status}</>;
  return (
    <section className="space-y-3">
      <SectionTitle title={t('serverMarketplace.installedTitle')} hint={t('serverMarketplace.installedHint')} />
      {status}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {(installed.data ?? []).map(plugin => (
          <ServerPluginInstalledCard
            key={plugin.name}
            plugin={plugin}
            canInstall={canInstall}
            busy={busy?.name === plugin.name ? busy.action : null}
            working={busy !== null}
            onAction={action => void run(action, { name: plugin.name, title: plugin.title, package: plugin.package, version: plugin.version })}
          />
        ))}
      </div>
    </section>
  );
}

function SectionTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-heading">{title}</h3>
      <p className="text-xs text-subtle">{hint}</p>
    </div>
  );
}

/** The Installed tab: marketplace plugins, the server's packages, its command modules. */
function InstalledTab({ modules, installed, round }: {
  modules: AsyncResult<PluginInfo[]>;
  installed: AsyncResult<InstalledPluginDto[] | null>;
  round: number;
}) {
  const { data, loading, error, refetch: refetchModules, refresh: refreshModules } = modules;
  const marketplace = useApi(getMarketplaceInstalled, [round]);
  useExtensionsChanged(marketplace.refresh);
  const serverPlugins = useApi(getInstalledServerPlugins, [round]);
  useServerPluginsChanged(serverPlugins.refresh);
  // A marketplace server plugin is listed once, in its own section with how it runs
  const fromMarketplace = new Set((serverPlugins.data ?? []).map(p => p.package));
  const hostPackages = installed.data?.filter(p => !fromMarketplace.has(p.id)) ?? null;
  const { t } = useI18n();

  // A toggle that fails says so (the card keeps its state); the list is reloaded quietly either way
  const [toggleError, setToggleError] = useState<string | null>(null);
  async function handleToggle(id: string) {
    setToggleError(null);
    try {
      await togglePlugin(id);
    } catch (err) {
      const name = data?.find(p => p.id === id)?.name || id;
      setToggleError(t('plugins.toggleFailed', { name, message: serverMessage(err) }));
    }
    refreshModules();
  }

  return (
    <div className="space-y-8">
      <MarketplaceInstalledSection installed={marketplace} />
      <ServerPluginsInstalledSection installed={serverPlugins} />
      {installed.loading && !installed.data && <PluginCardsSkeleton count={3} />}
      {hostPackages && hostPackages.length > 0 && (
        <section>
          <SectionTitle title={t('plugins.serverPlugins')} hint={t('plugins.serverPluginsHint')} />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {hostPackages.map(plugin => <InstalledPluginCard key={plugin.id} plugin={plugin} />)}
          </div>
        </section>
      )}

      <section>
        {installed.data && installed.data.length > 0 && (
          <SectionTitle title={t('plugins.commandModules')} hint={t('plugins.commandModulesHint')} />
        )}
        {loading && !data && <PluginCardsSkeleton count={6} label={t('plugins.loadingPlugins')} />}
        {error && <ErrorState error={error} onRetry={refetchModules} />}
        {toggleError && <ErrorState error={toggleError} title={t('plugins.manager')} compact className="mb-4" />}

        {!error && data && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.map((plugin: PluginInfo) => (
              <PluginCard key={plugin.id} plugin={plugin} onToggle={handleToggle} />
            ))}
            {data.length === 0 && (
              <EmptyState
                className="col-span-full bg-surface border border-border rounded-xl"
                message={installed.data && installed.data.length > 0 ? t('plugins.noModules') : t('plugins.noPlugins')}
              />
            )}
          </div>
        )}
      </section>
    </div>
  );
}

const TABS: ReadonlyArray<{ id: PluginsTab; label: 'marketplace.tabInstalled' | 'marketplace.tabMarketplace' }> = [
  { id: 'installed', label: 'marketplace.tabInstalled' },
  { id: 'marketplace', label: 'marketplace.tabMarketplace' },
];

/** Plugins: the Installed and Marketplace tabs, the tab kept in the URL (`?tab=marketplace`). */
export default function PluginsPage() {
  const { t } = useI18n();
  // Refresh reloads the open tab
  const [round, setRound] = useState(0);
  const modules = useApi(getPlugins, [round]);
  const installed = useApi(getInstalledPlugins, [round]);
  const [params, setParams] = useSearchParams();
  const tab = pluginsTab(params);
  const location = useLocation();
  const removedPage = (location.state as PluginsPageState | null)?.removedPage;
  const [dismissed, setDismissed] = useState<string | null>(null);

  const selectTab = useCallback((next: PluginsTab) => setParams(prev => {
    const query = new URLSearchParams(prev);
    if (next === 'installed') {
      query.delete('tab');
      query.delete('kind');
    } else {
      query.set('tab', next);
    }
    return query;
  }, { replace: true }), [setParams]);

  // Arrow keys move between the tabs (the tablist pattern)
  function onTabKey(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = TABS[(TABS.findIndex(x => x.id === tab) + 1) % TABS.length].id;
    selectTab(next);
    document.getElementById(`plugins-tab-${next}`)?.focus();
  }

  return (
    <div>
      <PageHeader
        title={t('nav.plugins')}
        subtitle={installed.data ? t('plugins.subtitle', { count: installed.data.length })
          : modules.data ? t('plugins.subtitle', { count: modules.data.length }) : t('plugins.manager')}
        actions={
          <button
            onClick={() => setRound(n => n + 1)}
            className="px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg transition-colors"
          >
            {t('common.refresh')}
          </button>
        }
      />
      <div className="p-4 sm:p-6 space-y-6">
        {removedPage && dismissed !== removedPage && (
          <Notice message={t('marketplace.pageRemoved', { title: removedPage })} onDismiss={() => setDismissed(removedPage)} />
        )}
        <div role="tablist" aria-label={t('marketplace.tabs')} className="flex gap-1 border-b border-border" onKeyDown={onTabKey}>
          {TABS.map(item => (
            <button
              key={item.id}
              id={`plugins-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              aria-controls={`plugins-panel-${item.id}`}
              tabIndex={tab === item.id ? 0 : -1}
              onClick={() => selectTab(item.id)}
              className={`-mb-px px-3 py-2 text-sm border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                tab === item.id ? 'border-primary text-heading font-medium' : 'border-transparent text-muted hover:text-text'
              }`}
            >
              {t(item.label)}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`plugins-panel-${tab}`} aria-labelledby={`plugins-tab-${tab}`}>
          {tab === 'installed' ? <InstalledTab modules={modules} installed={installed} round={round} /> : <MarketplaceTab key={round} />}
        </div>
      </div>
    </div>
  );
}
