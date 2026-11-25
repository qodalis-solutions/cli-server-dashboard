import { useState } from 'react';
import { Link } from 'react-router';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import { useApi } from '../../hooks/useApi';
import { getInstalledPlugins, getPlugins, togglePlugin } from '../../api/plugins';
import type { InstalledPluginDto, PluginInfo } from '../../types';
import { useI18n } from '../../i18n';
import { serverMessage } from '../../api/auth';
import ModuleIconView from './ModuleIconView';
import PluginToggle from './PluginToggle';
import { pluginPath } from './pluginPath';
import { EmptyState, ErrorState, Skeleton, SkeletonGroup } from '@qodalis/cli-server-dashboard-kit';

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

function SectionTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-heading">{title}</h3>
      <p className="text-xs text-subtle">{hint}</p>
    </div>
  );
}

export default function PluginsPage() {
  const { data, loading, error, refetch: refetchModules, refresh: refreshModules } = useApi(getPlugins, []);
  const installed = useApi(getInstalledPlugins, []);
  const { t } = useI18n();

  function refetch() {
    refetchModules();
    installed.refetch();
  }

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
    <div>
      <PageHeader
        title={t('nav.plugins')}
        subtitle={installed.data ? t('plugins.subtitle', { count: installed.data.length })
          : data ? t('plugins.subtitle', { count: data.length }) : t('plugins.manager')}
        actions={
          <button
            onClick={refetch}
            className="px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg transition-colors"
          >
            {t('common.refresh')}
          </button>
        }
      />
      <div className="p-4 sm:p-6 space-y-8">
        {installed.loading && !installed.data && <PluginCardsSkeleton count={3} />}
        {installed.data && installed.data.length > 0 && (
          <section>
            <SectionTitle title={t('plugins.serverPlugins')} hint={t('plugins.serverPluginsHint')} />
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {installed.data.map(plugin => <InstalledPluginCard key={plugin.id} plugin={plugin} />)}
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
    </div>
  );
}

/** Places of plugin cards (icon, name, description) while the plugins load. */
function PluginCardsSkeleton({ count, label }: { count: number; label?: string }) {
  return (
    <SkeletonGroup label={label} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="bg-surface border border-border rounded-xl p-4 flex items-start gap-3">
          <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-2.5 w-1/3" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}
