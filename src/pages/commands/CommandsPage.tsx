import { useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { useApi } from '../../hooks/useApi';
import { getCommands } from '../../api/commands';
import type { CommandDescriptor, ParameterDescriptor } from '../../types';
import { useI18n } from '../../i18n';

function ParamRow({ param }: { param: ParameterDescriptor }) {
  const { t } = useI18n();
  return (
    <tr className="border-b border-white/[0.03] last:border-0">
      <td className="px-3 py-1.5 font-mono text-xs text-indigo-300">{param.name}</td>
      <td className="px-3 py-1.5 text-xs text-slate-400">{param.type}</td>
      <td className="px-3 py-1.5 text-xs text-slate-400">{param.description}</td>
      <td className="px-3 py-1.5 text-xs">
        {param.required ? (
          <span className="text-red-400 font-medium">{t('commands.yes')}</span>
        ) : (
          <span className="text-slate-500">{t('commands.no')}</span>
        )}
      </td>
    </tr>
  );
}

function CommandRow({ cmd, depth = 0 }: { cmd: CommandDescriptor; depth?: number }) {
  const { t, formatNumber } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const hasDetails = (cmd.parameters && cmd.parameters.length > 0) || (cmd.processors && cmd.processors.length > 0);
  const indent = depth * 16;

  return (
    <>
      <tr
        className={`border-b border-white/[0.04] last:border-0 ${hasDetails ? 'cursor-pointer hover:bg-white/[0.04]' : ''}`}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2" style={{ paddingLeft: `${indent}px` }}>
            {hasDetails && (
              <span className={`text-slate-500 transition-transform text-xs ${expanded ? 'rotate-90' : ''}`}>▶</span>
            )}
            <span className="font-mono text-sm text-indigo-300">{cmd.command}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-slate-400">{cmd.description || '—'}</td>
        <td className="px-4 py-3 text-xs text-slate-500 font-mono">
          {cmd.metadata?.module as string ?? '—'}
        </td>
        <td className="px-4 py-3 text-xs text-slate-500 text-center">
          {formatNumber(cmd.parameters?.length ?? 0)}
        </td>
      </tr>
      {expanded && hasDetails && (
        <tr className="border-b border-white/[0.04]">
          <td colSpan={4} className="px-4 py-3 bg-white/[0.02]">
            {cmd.parameters && cmd.parameters.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1.5">{t('commands.parameters')}</div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className="px-3 py-2 text-left text-[10px] text-slate-500 uppercase tracking-wide font-medium">{t('commands.colName')}</th>
                        <th className="px-3 py-2 text-left text-[10px] text-slate-500 uppercase tracking-wide font-medium">{t('commands.colType')}</th>
                        <th className="px-3 py-2 text-left text-[10px] text-slate-500 uppercase tracking-wide font-medium">{t('commands.colDescription')}</th>
                        <th className="px-3 py-2 text-left text-[10px] text-slate-500 uppercase tracking-wide font-medium">{t('commands.colRequired')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cmd.parameters.map(p => <ParamRow key={p.name} param={p} />)}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {cmd.processors && cmd.processors.length > 0 && (
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1.5">{t('commands.subCommands')}</div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className="px-3 py-2 text-left text-[10px] text-slate-500 uppercase tracking-wide font-medium">{t('commands.colCommand')}</th>
                        <th className="px-3 py-2 text-left text-[10px] text-slate-500 uppercase tracking-wide font-medium">{t('commands.colDescription')}</th>
                        <th className="px-3 py-2 text-left text-[10px] text-slate-500 uppercase tracking-wide font-medium">{t('commands.colModule')}</th>
                        <th className="px-3 py-2 text-left text-[10px] text-slate-500 uppercase tracking-wide font-medium text-center">{t('commands.colParams')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cmd.processors.map(sub => (
                        <CommandRow key={sub.command} cmd={sub} depth={1} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function CommandsPage() {
  const { data, loading, error, refetch } = useApi(getCommands, []);
  const [search, setSearch] = useState('');
  const { t } = useI18n();

  const filtered = data
    ? data.filter(cmd =>
        cmd.command.toLowerCase().includes(search.toLowerCase()) ||
        (cmd.description ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : [];

  return (
    <div>
      <PageHeader
        title={t('nav.commands')}
        subtitle={data ? t('commands.subtitle', { count: data.length }) : t('common.loading')}
        actions={
          <button
            onClick={refetch}
            className="px-3 py-1.5 text-xs bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 rounded-lg transition-colors"
          >
            {t('common.refresh')}
          </button>
        }
      />

      <div className="p-6 space-y-4">
        <input
          type="text"
          placeholder={t('commands.searchPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm px-3 py-2 text-sm bg-white/[0.06] border border-white/[0.1] rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50"
        />

        {loading && <div className="text-slate-400 text-sm">{t('commands.loadingCommands')}</div>}
        {error && <div className="text-red-400 text-sm">{t('commands.error', { message: error })}</div>}

        {!loading && !error && (
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium uppercase tracking-wide">{t('commands.colCommand')}</th>
                  <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium uppercase tracking-wide">{t('commands.colDescription')}</th>
                  <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium uppercase tracking-wide">{t('commands.colModule')}</th>
                  <th className="px-4 py-3 text-center text-xs text-slate-500 font-medium uppercase tracking-wide">{t('commands.colParams')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(cmd => (
                  <CommandRow key={cmd.command} cmd={cmd} />
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="px-4 py-8 text-center text-slate-500 text-sm">
                {search ? t('commands.noMatch') : t('commands.noCommands')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
