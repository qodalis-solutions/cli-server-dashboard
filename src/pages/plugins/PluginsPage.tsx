import { useState } from 'react';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import { useApi } from '../../hooks/useApi';
import { getInstalledPlugins, getPlugins, togglePlugin } from '../../api/plugins';
import type { InstalledPluginDto, PluginInfo } from '../../types';
import { useI18n } from '../../i18n';
import ModuleIconView from './ModuleIconView';

function PluginCard({ plugin, onToggle }: { plugin: PluginInfo; onToggle: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const processorCount = plugin.processorCount ?? plugin.processors?.length ?? 0;
  const [toggling, setToggling] = useState(false);
  const { t, formatNumber } = useI18n();

  async function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    setToggling(true);
    try {
      await onToggle(plugin.id);
    } finally {
      setToggling(false);
    }
  }

  return (
    <div
      className={`bg-surface border rounded-xl overflow-hidden transition-colors cursor-pointer ${
        plugin.enabled
          ? 'border-border hover:border-border'
          : 'border-border/50 opacity-60 hover:opacity-80'
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <ModuleIconView icon={plugin.icon} name={plugin.name || plugin.id} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-heading text-sm truncate">{plugin.name || plugin.id}</span>
              <span className="text-[10px] text-subtle font-mono bg-control px-1.5 py-0.5 rounded">
                v{plugin.version}
              </span>
            </div>
            <p className="text-xs text-muted mt-1 line-clamp-2">{plugin.description || t('plugins.noDescription')}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={plugin.enabled ? 'success' : 'neutral'} dot>
              {plugin.enabled ? t('common.enabled') : t('common.disabled')}
            </Badge>
            <button
              onClick={handleToggle}
              disabled={toggling}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                plugin.enabled ? 'bg-primary' : 'bg-subtle'
              }`}
              title={plugin.enabled ? t('plugins.disablePlugin') : t('plugins.enablePlugin')}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-on-primary transition-transform ${
                  plugin.enabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-3">
          <div className="text-[11px] text-subtle">
            <span className="text-text font-medium">{formatNumber(processorCount)}</span>
            {' '}{t('plugins.processorUnit', { count: processorCount })}
          </div>
          {plugin.processors.length > 0 && (
            <button
              onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}
              className="text-[11px] text-accent hover:text-accent transition-colors"
            >
              {expanded ? t('plugins.hideCommands') : t('plugins.showCommands')}
            </button>
          )}
        </div>
      </div>

      {expanded && plugin.processors.length > 0 && (
        <div className="border-t border-border/75 px-4 py-3 bg-surface/50">
          <div className="text-[10px] text-subtle uppercase tracking-wider font-medium mb-2">
            {t('plugins.registeredCommands')}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {plugin.processors.map(cmd => (
              <span
                key={cmd}
                className="font-mono text-[11px] text-accent bg-primary/10 border border-primary/20 px-2 py-0.5 rounded"
              >
                {cmd}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InstalledPluginCard({ plugin }: { plugin: InstalledPluginDto }) {
  const { t } = useI18n();
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-heading text-sm truncate">{plugin.name || plugin.id}</span>
        {plugin.version && (
          <span className="text-[10px] text-subtle font-mono bg-control px-1.5 py-0.5 rounded">v{plugin.version}</span>
        )}
      </div>
      <div className="text-[11px] text-subtle font-mono mt-0.5 truncate" title={plugin.id}>{plugin.id}</div>
      <p className="text-xs text-muted mt-1 line-clamp-2">{plugin.description || t('plugins.noDescription')}</p>
    </div>
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
  const { data, loading, error, refetch: refetchModules } = useApi(getPlugins, []);
  const installed = useApi(getInstalledPlugins, []);
  const { t } = useI18n();

  function refetch() {
    refetchModules();
    installed.refetch();
  }

  async function handleToggle(id: string) {
    await togglePlugin(id);
    refetch();
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
          {loading && <div className="text-muted text-sm">{t('plugins.loadingPlugins')}</div>}
          {error && <div className="text-error text-sm">{t('plugins.error', { message: error })}</div>}

          {!loading && !error && data && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {data.map((plugin: PluginInfo) => (
                <PluginCard key={plugin.id} plugin={plugin} onToggle={handleToggle} />
              ))}
              {data.length === 0 && (
                <div className="col-span-full text-subtle text-sm">
                {installed.data && installed.data.length > 0 ? t('plugins.noModules') : t('plugins.noPlugins')}
              </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
