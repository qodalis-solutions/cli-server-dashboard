import { useState } from 'react';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import { useApi } from '../../hooks/useApi';
import { getPlugins, togglePlugin } from '../../api/plugins';
import type { PluginInfo } from '../../types';

function PluginCard({ plugin, onToggle }: { plugin: PluginInfo; onToggle: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [toggling, setToggling] = useState(false);

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
      className={`bg-white/[0.04] border rounded-xl overflow-hidden transition-colors cursor-pointer ${
        plugin.enabled
          ? 'border-white/[0.08] hover:border-white/[0.14]'
          : 'border-white/[0.04] opacity-60 hover:opacity-80'
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-white text-sm truncate">{plugin.name || plugin.id}</span>
              <span className="text-[10px] text-slate-500 font-mono bg-white/[0.06] px-1.5 py-0.5 rounded">
                v{plugin.version}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 line-clamp-2">{plugin.description || 'No description'}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={plugin.enabled ? 'success' : 'neutral'} dot>
              {plugin.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
            <button
              onClick={handleToggle}
              disabled={toggling}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                plugin.enabled ? 'bg-indigo-500' : 'bg-slate-600'
              }`}
              title={plugin.enabled ? 'Disable plugin' : 'Enable plugin'}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  plugin.enabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-3">
          <div className="text-[11px] text-slate-500">
            <span className="text-slate-300 font-medium">{plugin.processorCount}</span>
            {' '}processor{plugin.processorCount !== 1 ? 's' : ''}
          </div>
          {plugin.processors.length > 0 && (
            <button
              onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              {expanded ? 'Hide commands ▲' : 'Show commands ▼'}
            </button>
          )}
        </div>
      </div>

      {expanded && plugin.processors.length > 0 && (
        <div className="border-t border-white/[0.06] px-4 py-3 bg-white/[0.02]">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">
            Registered Commands
          </div>
          <div className="flex flex-wrap gap-1.5">
            {plugin.processors.map(cmd => (
              <span
                key={cmd}
                className="font-mono text-[11px] text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded"
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

export default function PluginsPage() {
  const { data, loading, error, refetch } = useApi(getPlugins, []);

  async function handleToggle(id: string) {
    await togglePlugin(id);
    refetch();
  }

  return (
    <div>
      <PageHeader
        title="Plugins"
        subtitle={data ? `${data.length} installed plugins` : 'Plugin manager'}
        actions={
          <button
            onClick={refetch}
            className="px-3 py-1.5 text-xs bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 rounded-lg transition-colors"
          >
            Refresh
          </button>
        }
      />
      <div className="p-6">
        {loading && <div className="text-slate-400 text-sm">Loading plugins...</div>}
        {error && <div className="text-red-400 text-sm">Error: {error}</div>}

        {!loading && !error && data && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.map((plugin: PluginInfo) => (
              <PluginCard key={plugin.id} plugin={plugin} onToggle={handleToggle} />
            ))}
            {data.length === 0 && (
              <div className="col-span-full text-slate-500 text-sm">No plugins installed.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
